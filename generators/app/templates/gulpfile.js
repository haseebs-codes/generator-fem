import { src, dest, watch, series } from "gulp";
import gulpSass from "gulp-sass";
import * as dartSass from "sass";
import purgecss from "gulp-purgecss";

const sass = gulpSass(dartSass);

function buildStyles() {
  return src('assets/styles/scss/**/*.scss')
    .pipe(sass())
    .pipe(purgecss({ content: ['*.html'] }))
    .pipe(dest('assets/styles/css'))
}

function watchTask() {
  watch(['assets/styles/scss/**/*.scss'], buildStyles)
}

export default series(buildStyles, watchTask)
