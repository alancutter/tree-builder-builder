var gulp = require('gulp');
var fs = require('fs');
var coveralls = require('gulp-coveralls');
var istanbul = require('gulp-istanbul');
var mocha = require('gulp-mocha');

var stageLoader = require('./core/stage-loader');
var stream = require('./core/stream');
var options = require('./core/options');
var trace = require('./core/trace');

var tasks = {};

function runTests(mochaReporter) {
  return gulp.src(['tests/**/*.js', 'lib/*/tests/*.js'])
      .pipe(mocha({
        ui: 'bdd',
        ignoreLeaks: true,
        reporter: mochaReporter,
      }));
}

function buildTestTask(name, mochaReporter, istanbulReporters) {
  gulp.task(name, function(cb) {
    if (!options.coverage && typeof options.coverage !== 'undefined') {
      runTests(mochaReporter).on('end', cb);
      return;
    }
    gulp.src(['core/*.js', 'lib/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on('finish', function() {
      require('./core/trace').enable();
      runTests(mochaReporter)
      .pipe(istanbul.writeReports({
        reporters: istanbulReporters,
      }))
      .on('end', function() {
        if (istanbulReporters.indexOf('html') !== -1) {
          process.stdout.write('Detailed coverage report at file://' + fs.realpathSync('coverage/index.html') + '\n');
        }
        if (istanbulReporters.indexOf('lcov') !== -1) {
          gulp.src('coverage/lcov.info')
          .pipe(coveralls())
          .on('error', function(err) {
            console.warn(err);
            console.warn('Failed to upload LCOV data to Coveralls.')
            console.warn('Has this repository been enabled for Coveralls tracking? https://coveralls.io/repos/new');
          });
        }
        cb();
      });
    });
  });
}

buildTestTask('test', 'nyan', ['html', 'text-summary']);
buildTestTask('travis-test', 'spec', ['lcov', 'text', 'text-summary']);

function buildTask(name, stageList) {
  tasks[name] = stageList;
  gulp.task(name, function(incb) {
    var cb = function(data) {
      trace.dump();
      incb();
    };
    stageLoader.processStages(stageList.map(stageLoader.stageSpecificationToStage), cb, function(e) { throw e; });
  });
};

/*
 * Some example pipelines.
 */
buildTask('html', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'HTMLWriter', 'output:result.html.html']);
buildTask('js', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'JSWriter', 'output:result.js.html']);
buildTask('stats', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'StatsWriter', 'consoleOutput']);

/*
 * examples using filters
 */
buildTask('compactComputedStyle', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'StyleFilter', 'output:' + options.file + '.filter']);
buildTask('extractStyle', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'StyleMinimizationFilter', 'output:' + options.file + '.filter']);
buildTask('tokenStyles', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'StyleTokenizerFilter', 'output:' + options.file + '.filter']);
buildTask('nukeIFrame', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'NukeIFrameFilter', 'output:' + options.file + '.filter']);

/*
 * example of fabrication
 */
buildTask('generate', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'jsonParse', 'SchemaBasedFabricator', 'output:' + options.file + '.gen']);

/*
 * examples using device telemetry
 */
buildTask('get', [{name: 'input', options: {data: options.url}}, 'telemetrySave', 'output:result.json']);
buildTask('perf', [{name: 'input', options: {data: options.url}}, 'telemetryPerf', 'output:trace.json']);
buildTask('endToEnd', [{name: 'input', options: {data: options.url}}, 'telemetrySave', 'HTMLWriter', 'simplePerfer', 'output:trace.json']);

/*
 * running an experiment
 */
buildTask('runExperiment', [{name: 'input', options: {data: options.file}}, 'fileToBuffer', 'bufferToString', 'doExperiment']);

/*
 * ejs fabrication
 */
gulp.task('ejs', function(incb) {
  var cb = function(data) { incb(); };
  stageLoader.processStages(
    [
      stageLoader.stageSpecificationToStage({name: 'input', options: {data: options.file}}),
      stageLoader.stageSpecificationToStage('fileToBuffer'),
      stageLoader.stageSpecificationToStage('bufferToString'),
      stageLoader.stageSpecificationToStage('ejsFabricator'),
      stageLoader.stageSpecificationToStage({name: 'writeStringFile', options: {tag: 'ejsFabricator'}})
    ], cb, function(e) { throw e; });
});

/*
 * TODO: Refactor stage-loader so it can load fancy stages too.
 *
 * example of using stages directly
 */

function tagFilename() {
  return stream.tag(function(data, tags) { return {key: 'filename', value: data} });
}

function genFilename() {
  return stream.tag(function(data, tags) {
    var filename = tags['filename'].replace(new RegExp(options.inputSpec), options.outputSpec);
    return {key: 'filename', value: filename} });
}

gulp.task('mhtml', function(incb) {
  var cb = function(data) { incb(); };
  stageLoader.processStages(
      [
        stageLoader.stageSpecificationToStage({name: 'input', options: {data: '.'}}),
        stageLoader.stageSpecificationToStage('readDir'),
        stageLoader.stageSpecificationToStage({name: 'filter', options: {regExp: new RegExp(options.inputSpec)}}),
        tagFilename(),
        stageLoader.stageSpecificationToStage('fileToJSON'),
        stageLoader.stageSpecificationToStage('HTMLWriter'),
        genFilename(),
        stream.write()
      ], cb, function(e) { throw e; });
});

gulp.task('processLogs', function(incb) {
  require('./lib/trace-phases');
  var phase = require('./core/phase');
  var cb = function(data) { incb(); };
  stageLoader.processStages(
      [
        stageLoader.stageSpecificationToStage({name: 'input', options: {data: options.dir}}),
        stageLoader.stageSpecificationToStage('readDir'),
        phase.pipeline(
            [
              stageLoader.stageSpecificationToStage('fileToJSON'),
              stageLoader.stageSpecificationToStage('traceFilter'),
              stageLoader.stageSpecificationToStage('tracePIDSplitter'),
              stageLoader.stageSpecificationToStage('traceTree'),
              stageLoader.stageSpecificationToStage({name: 'tracePrettyPrint', options: {showTrace: 'false'}}),
            ]),
        stageLoader.stageSpecificationToStage({name: 'log', options: {tags: ['filename']}})
      ], cb, function(e) { throw e; });
});

module.exports.tasks = tasks;
