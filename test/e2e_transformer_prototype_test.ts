/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

// tslint:disable:no-unused-expression mocha .to.be.empty getters.

import {assert, expect} from 'chai';
import * as path from 'path';
import {SourceMapConsumer} from 'source-map';
import * as ts from 'typescript';

import * as cliSupport from '../src/cli_support';
import {convertDecorators} from '../src/decorator-annotator';
import {DefaultSourceMapper, getInlineSourceMapCount, setInlineSourceMap, sourceMapTextToConsumer} from '../src/source_map_utils';
import * as tsickle from '../src/tsickle';
import {createOutputRetainingCompilerHost, createSourceReplacingCompilerHost, toArray} from '../src/util';

import * as testSupport from './test_support';

import * as variableTypingTransformer from '../src/variable_declaration_typing_transformer';

describe('transformer prototype', () => {
  it.only('adds a comment to variable declarations', () => {
    // Run tsickle+TSC to convert inputs to Closure JS files.
    const {js, sourceMap} = compile(`let x : string = 'a string';`, variableTypingTransformer.transformer);

    console.log(js);
    sourceMapTextToConsumer(sourceMap).eachMapping((m) => console.log(JSON.stringify(m)));

    expect(js).to.not.be.null;
    expect(js).to.contain('@type {?}');
  });
});

const tscOptions = {
  sourceMap: true,
};

function compile(file: string, transformer: ts.TransformerFactory<ts.SourceFile>): {js: string, sourceMap: string} {
  // Parse and load the program without tsickle processing.
  // This is so:
  // - error messages point at the original source text
  // - tsickle can use the result of typechecking for annotation
  const resolvedSources = new Map<string, string>();
  resolvedSources.set(ts.sys.resolvePath('input.ts'), file);

  const jsFiles = new Map<string, string>();
  const outputRetainingHost =
      createOutputRetainingCompilerHost(jsFiles, ts.createCompilerHost(tscOptions));

  const sourceReplacingHost =
      createSourceReplacingCompilerHost(resolvedSources, outputRetainingHost);

  const program = ts.createProgram(['input.ts'], tscOptions, sourceReplacingHost);
  {  // Scope for the "diagnostics" variable so we can use the name again later.
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      return {js: '', sourceMap: ''};
    }
  }

  const {diagnostics} = program.emit(undefined, undefined, undefined, undefined, {
        before: [
            transformer
        ]
    });
  if (diagnostics.length > 0) {
    return {js: '', sourceMap: ''};
  }

  const js = getFileWithName('input.js', jsFiles) || '';
  const sourceMap = getFileWithName('input.js.map', jsFiles) || '';
  return {js, sourceMap};
}

function getFileWithName(filename: string, files: Map<string, string>): string|undefined {
  for (const filepath of toArray(files.keys())) {
    if (path.parse(filepath).base === path.parse(filename).base) {
      return files.get(filepath);
    }
  }
  return undefined;
}
