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

    // 1. Copy everything from the Frontend Mentor folder
    this.fs.copy(`${sourceGlob}/**/*`, this.destinationPath(), {
      globOptions: {
        dot: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/package-lock.json"],
      },
    });

    // 2. package.json
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

    // 3. gulpfile (from templates/)
    this.fs.copy(
      this.templatePath("gulpfile.js"),
      this.destinationPath("gulpfile.js"),
    );

    // 4. SCSS starter files (from templates/scss)
    this.fs.copy(
      this.templatePath("scss"),
      this.destinationPath("assets/styles/scss"),
    );

    // 5. If the challenge has a data.json, add a JS file that already fetches it
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

    // 6. Link the CSS (and JS, if there's a data.json) in index.html
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
