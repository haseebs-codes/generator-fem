import Generator from "yeoman-generator";
import path from "node:path";
import fs from "node:fs";

// npm package names can't have spaces or capitals: "Time Tracking Dashboard" → "time-tracking-dashboard"
const toPackageName = (str) =>
  str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Windows "Copy as path" wraps the path in quotes, so strip them
const cleanPath = (str) => str.trim().replace(/^["']|["']$/g, "");

//? Reads style-guide.md and returns { colors, fonts, bodySize }
function parseStyleGuide(markdown) {
  const colors = {};
  const fonts = [];
  let bodySize = null;

  let section = '';
  let group = 'color';

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{2,3})\s+(.+)/);
    if (heading) {
      if (heading[1] === '##') {
        section = toPackageName(heading[2]);
        group = 'color';
      } else if (section === 'colors') {
        group = toPackageName(heading[2]);
      }
      continue;
    }

    if (section === 'colors') {
      const color = line.match(/^-\s*([^:]+):\s*((?:hsla?|rgba?)\([^)]*\)|#[0-9a-f]{3,8})/i);
      if (color) {
        const name = toPackageName(color[1].replace(/\(.*?\)/g, ''));
        colors[group] ??= {};
        colors[group][name] = color[2];
      }
    }

    if (section === 'typography') {
      const family = line.match(/^-\s*Family:\s*(.+)/i);
      if (family) {
        const name = family[1].replace(/\[([^\]]+)\]\(.*?\)/, '$1').trim();
        fonts.push({ name, weights: [] });
      }

      const weights = line.match(/^-\s*Weights?:\s*(.+)/i);
      if (weights && fonts.length) {
        fonts.at(-1).weights = weights[1].match(/\d{3}/g) ?? [];
      }

      const size = line.match(/^-\s*Font size[^:]*:\s*(\d+(?:\.\d+)?)px/i);
      if (size && !bodySize) {
        bodySize = `${Number(size[1]) / 16}rem`;
      }
    }
  }

  return { colors, fonts, bodySize };
}
//? Turns the parsed data into the text that goes inside the Sass maps
function toScss({ colors, fonts, bodySize }) {
  const colorsMap = Object.entries(colors)
    .map(([group, shades]) => {
      const lines = Object.entries(shades)
        .map(([key, value]) => `    '${key}': ${value},`)
        .join('\n');
      return `  ${group}: (\n${lines}\n  ),`;
    })
    .join('\n');

  const fontNames = ['main', 'secondary', 'tertiary'];
  const fontFamilies = fonts
    .map((font, i) => {
      const fallback = /serif/i.test(font.name) && !/sans/i.test(font.name) ? 'serif' : 'sans-serif';
      return `    '${fontNames[i] ?? `font-${i + 1}`}': ('${font.name}', ${fallback}),`;
    })
    .join('\n');

  return { colorsMap, fontFamilies, bodySize: bodySize ?? '1rem' };
}


export default class extends Generator {
  initializing() {
    this.log("Welcome to Front-End Mentor Generator");
  }

  async prompting() {
    this.answers = await this.prompt([
      {
        type: "input",
        name: "source",
        message: "Path to the Frontend Mentor folder:",
        filter: cleanPath,
        validate: (input) =>
          fs.existsSync(cleanPath(input)) || "Folder not found",
      },
      {
        type: "input",
        name: "name",
        message: "Project name:",
        default: (answers) => toPackageName(path.basename(answers.source)),
        filter: toPackageName,
      },
    ]);
  }

  writing() {
    const source = path.resolve(this.answers.source);
    const sourceGlob = source.replace(/\\/g, "/"); // globs need forward slashes on Windows

    //? 1. Copy everything from the Frontend Mentor folder
    this.fs.copy(`${sourceGlob}/**/*`, this.destinationPath(), {
      globOptions: {
        dot: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/package-lock.json"],
      },
    });

    //? 2. package.json
    this.fs.writeJSON(this.destinationPath("package.json"), {
      name: this.answers.name,
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "gulp",
      },
      devDependencies: {
        gulp: "^5.0.1",
        "gulp-purgecss": "^8.0.0",
        "gulp-sass": "^6.0.1",
        purgecss: "^8.0.0",
        sass: "^1.105.0",
      },
    });

    //? 3. gulpfile (from templates/)
    this.fs.copy(
      this.templatePath("gulpfile.js"),
      this.destinationPath("gulpfile.js"),
    );

    //? 4. SCSS starter files (from templates/scss)
    this.fs.copy(
      this.templatePath("scss"),
      this.destinationPath("assets/styles/scss"),
    );

    //? 4b. Fill _variables.scss from style-guide.md
    const guidePath = path.join(source, 'style-guide.md');
    const guide = fs.existsSync(guidePath)
      ? parseStyleGuide(fs.readFileSync(guidePath, 'utf8'))
      : { colors: {}, fonts: [], bodySize: null };

    //? No style guide or no colors found → use placeholders so Sass still compiles
    if (!Object.keys(guide.colors).length) {
      guide.colors = { neutral: { dark: 'hsl(0, 0%, 10%)', white: 'hsl(0, 0%, 100%)' } };
    }
    if (!guide.fonts.length) {
      guide.fonts = [{ name: 'system-ui', weights: [] }];
    }

    this.fs.copyTpl(
      this.templatePath('scss/_variables.scss'),
      this.destinationPath('assets/styles/scss/_variables.scss'),
      toScss(guide),
    );

    //? 5. If the challenge has a data.json, add a JS file that already fetches it
    if (fs.existsSync(path.join(source, "data.json"))) {
      this.fs.write(
        this.destinationPath("assets/js/main.js"),
        `async function loadData() {
  const response = await fetch('./data.json');
  const data = await response.json();
  console.log(data);
}

loadData();
`,
      );
    }

    //? 6. Link the CSS (and JS, if there's a data.json) in index.html
    const indexPath = this.destinationPath("index.html");

    if (this.fs.exists(indexPath)) {
      let html = this.fs.read(indexPath);

      if (!html.includes("assets/styles/css/main.css")) {
        html = html.replace(
          "</head>",
          '  <link rel="stylesheet" href="assets/styles/css/main.css">\n</head>',
        );
      }

      if (
        fs.existsSync(path.join(source, "data.json")) &&
        !html.includes("assets/js/main.js")
      ) {
        html = html.replace(
          "</body>",
          '  <script type="module" src="assets/js/main.js"></script>\n</body>',
        );
      }

      this.fs.write(indexPath, html);
    }
  }

  end() {
    this.log(
      `\nDone! Run "npm run dev" to start working on ${this.answers.name}.`,
    );
  }
}
