/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

// tslint:disable:no-unused-expression mocha .to.be.empty getters.

import {expect} from 'chai';
import {SourceMapConsumer} from 'source-map';
import * as ts from 'typescript';

import {convertDecorators} from '../src/decorator-annotator';
import {DefaultSourceMapper} from '../src/source_map_utils';
import * as tsickle from '../src/tsickle';

import * as testSupport from './test_support';

const testCaseFileName = 'testcase.ts';

function sources(sourceText: string): Map<string, string> {
  const sources = new Map<string, string>([
    [testCaseFileName, sourceText],
    ['bar.d.ts', 'declare module "bar" { export class BarService {} }']
  ]);
  return sources;
}

function verifyCompiles(sourceText: string) {
  // This throws an exception on error.
  testSupport.createProgram(sources(sourceText));
}

describe(
    'decorator-annotator', () => {
      function translate(sourceText: string, allowErrors = false) {
        const program = testSupport.createProgram(sources(sourceText));
        const sourceMapper = new DefaultSourceMapper(testCaseFileName);
        const {output, diagnostics} = convertDecorators(
            program.getTypeChecker(), program.getSourceFile(testCaseFileName), sourceMapper);
        if (!allowErrors) expect(diagnostics).to.be.empty;
        verifyCompiles(output);
        return {output, diagnostics, sourceMap: sourceMapper.sourceMap};
      }

      function expectUnchanged(sourceText: string) {
        expect(translate(sourceText).output).to.equal(sourceText);
      }

      it('generates a source map', () => {
        const {output, sourceMap} = translate(`
/** @Annotation */ let Test1: Function;
@Test1
export class Foo {
}
let X = 'a string';`);
        const rawMap = sourceMap.toJSON();
        const consumer = new SourceMapConsumer(rawMap);
        const lines = output.split('\n');
        const stringXLine = lines.findIndex(l => l.indexOf('a string') !== -1) + 1;
        expect(consumer.originalPositionFor({line: stringXLine, column: 10}).line)
            .to.equal(6, 'string X definition');
      });

      describe('class decorator rewriter', () => {
        it('leaves plain classes alone', () => {
          expectUnchanged(`class Foo {}`);
        });

        it('leaves un-marked decorators alone', () => {
          expectUnchanged(`
          let Decor: Function;
          @Decor class Foo {
            constructor(@Decor p: number) {}
            @Decor m(): void {}
          }`);
        });

        it('transforms decorated classes', () => {
          expect(translate(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;
let param: any;
@Test1
@Test2(param)
class Foo {
  field: string;
}`).output).to.equal(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;
let param: any;


class Foo {
  field: string;
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test1 },
{ type: Test2, args: [param, ] },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });

        it('transforms decorated classes with function expression annotation declaration', () => {
          expect(translate(`
/** @Annotation */ function Test() {};
@Test
class Foo {
  field: string;
}`).output).to.equal(`
/** @Annotation */ function Test() {};

class Foo {
  field: string;
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });

        it('transforms decorated classes with an exported annotation declaration', () => {
          expect(translate(`
/** @Annotation */ export let Test: Function;
@Test
class Foo {
  field: string;
}`).output).to.equal(`
/** @Annotation */ export let Test: Function;

class Foo {
  field: string;
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });

        it('accepts various complicated decorators', () => {
          expect(translate(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;
/** @Annotation */ let Test3: Function;
/** @Annotation */ function Test4<T>(param: any): ClassDecorator { return null; }
let param: any;
@Test1({name: 'percentPipe'}, class ZZZ {})
@Test2
@Test3()
@Test4<string>(param)
class Foo {
}`).output).to.equal(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;
/** @Annotation */ let Test3: Function;
/** @Annotation */ function Test4<T>(param: any): ClassDecorator { return null; }
let param: any;




class Foo {
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test1, args: [{name: 'percentPipe'}, class ZZZ {}, ] },
{ type: Test2 },
{ type: Test3 },
{ type: Test4, args: [param, ] },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });

        it(`doesn't eat 'export'`, () => {
          expect(translate(`
/** @Annotation */ let Test1: Function;
@Test1
export class Foo {
}`).output).to.equal(`
/** @Annotation */ let Test1: Function;

export class Foo {
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test1 },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });

        it(`handles nested classes`, () => {
          expect(translate(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;
@Test1
export class Foo {
  foo() {
    @Test2
    class Bar {
    }
  }
}`).output).to.equal(`
/** @Annotation */ let Test1: Function;
/** @Annotation */ let Test2: Function;

export class Foo {
  foo() {
    \n    class Bar {
    static decorators: {type: Function, args?: any[]}[] = [
{ type: Test2 },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}
  }
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test1 },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
];
}`);
        });
      });

      describe('ctor decorator rewriter', () => {
        it('ignores ctors that have no applicable injects', () => {
          expectUnchanged(`
import {BarService} from 'bar';
class Foo {
  constructor(bar: BarService, num: number) {
  }
}`);
        });

        it('transforms injected ctors', () => {
          expect(translate(`
/** @Annotation */ let Inject: Function;
enum AnEnum { ONE, TWO, };
abstract class AbstractService {}
class Foo {
  constructor(@Inject bar: AbstractService, @Inject('enum') num: AnEnum) {
  }
}`).output).to.equal(`
/** @Annotation */ let Inject: Function;
enum AnEnum { ONE, TWO, };
abstract class AbstractService {}
class Foo {
  constructor( bar: AbstractService,  num: AnEnum) {
  }
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: AbstractService, decorators: [{ type: Inject }, ]},
{type: AnEnum, decorators: [{ type: Inject, args: ['enum', ] }, ]},
];
}`);
        });

        it('stores non annotated parameters if the class has at least one decorator', () => {
          expect(translate(`
import {BarService} from 'bar';
/** @Annotation */ let Test1: Function;
@Test1()
class Foo {
  constructor(bar: BarService, num: number) {
  }
}`).output).to.equal(`
import {BarService} from 'bar';
/** @Annotation */ let Test1: Function;

class Foo {
  constructor(bar: BarService, num: number) {
  }
static decorators: {type: Function, args?: any[]}[] = [
{ type: Test1 },
];
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: BarService, },
null,];
}`);
        });

        it('handles complex ctor parameters', () => {
          expect(translate(`
import * as bar from 'bar';
/** @Annotation */ let Inject: Function;
let param: any;
class Foo {
  constructor(@Inject(param) x: bar.BarService, {a, b}, defArg = 3, optional?: bar.BarService) {
  }
}`).output).to.equal(`
import * as bar from 'bar';
/** @Annotation */ let Inject: Function;
let param: any;
class Foo {
  constructor( x: bar.BarService, {a, b}, defArg = 3, optional?: bar.BarService) {
  }
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: bar.BarService, decorators: [{ type: Inject, args: [param, ] }, ]},
null, null,
{type: bar.BarService, },
];
}`);
        });

        it('includes decorators for primitive type ctor parameters', () => {
          expect(translate(`
/** @Annotation */ let Inject: Function;
let APP_ID: any;
class ViewUtils {
  constructor(@Inject(APP_ID) private _appId: string) {}
}`).output).to.equal(`
/** @Annotation */ let Inject: Function;
let APP_ID: any;
class ViewUtils {
  constructor( private _appId: string) {}
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: undefined, decorators: [{ type: Inject, args: [APP_ID, ] }, ]},
];
}`);
        });

        it('strips generic type arguments', () => {
          expect(translate(`
/** @Annotation */ let Inject: Function;
class Foo {
  constructor(@Inject typed: Promise<string>) {
  }
}`).output).to.equal(`
/** @Annotation */ let Inject: Function;
class Foo {
  constructor( typed: Promise<string>) {
  }
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: Promise, decorators: [{ type: Inject }, ]},
];
}`);
        });

        it('avoids using interfaces as values', () => {
          expect(translate(`
/** @Annotation */ let Inject: Function = null;
class Class {}
interface Iface {}
class Foo {
  constructor(@Inject aClass: Class, @Inject aIface: Iface) {}
}`).output).to.equal(`
/** @Annotation */ let Inject: Function = null;
class Class {}
interface Iface {}
class Foo {
  constructor( aClass: Class,  aIface: Iface) {}
/** @nocollapse */
static ctorParameters: () => ({type: any, decorators?: {type: Function, args?: any[]}[]}|null)[] = () => [
{type: Class, decorators: [{ type: Inject }, ]},
{type: undefined, decorators: [{ type: Inject }, ]},
];
}`);
        });
      });

      describe('method decorator rewriter', () => {
        it('leaves ordinary methods alone', () => {
          expectUnchanged(`
class Foo {
  bar() {}
}`);
        });

        it('gathers decorators from methods', () => {
          expect(translate(`
/** @Annotation */ let Test1: Function;
class Foo {
  @Test1('somename')
  bar() {}
}`).output).to.equal(`
/** @Annotation */ let Test1: Function;
class Foo {
  \n  bar() {}
static propDecorators: {[key: string]: {type: Function, args?: any[]}[]} = {
"bar": [{ type: Test1, args: ['somename', ] },],
};
}`);
        });

        it('gathers decorators from fields and setters', () => {
          expect(translate(`
/** @Annotation */ let PropDecorator: Function;
class ClassWithDecorators {
  @PropDecorator("p1") @PropDecorator("p2") a;
  b;

  @PropDecorator("p3")
  set c(value) {}
}`).output).to.equal(`
/** @Annotation */ let PropDecorator: Function;
class ClassWithDecorators {
    a;
  b;

  \n  set c(value) {}
static propDecorators: {[key: string]: {type: Function, args?: any[]}[]} = {
"a": [{ type: PropDecorator, args: ["p1", ] },{ type: PropDecorator, args: ["p2", ] },],
"c": [{ type: PropDecorator, args: ["p3", ] },],
};
}`);
        });

        it('errors on weird class members', () => {
          const {diagnostics} = translate(`
/** @Annotation */ let Test1: Function;
let param: any;
class Foo {
  @Test1('somename')
  [param]() {}
}`, true /* allow errors */);

          expect(tsickle.formatDiagnostics(diagnostics))
              .to.equal(
                  'Error at testcase.ts:5:3: cannot process decorators on strangely named method');
        });
        it('avoids mangling code relying on ASI', () => {
          expect(translate(`
/** @Annotation */ let PropDecorator: Function;
class Foo {
  missingSemi = () => {}
  @PropDecorator other: number;
}`).output).to.equal(`
/** @Annotation */ let PropDecorator: Function;
class Foo {
  missingSemi = () => {}
   other: number;
static propDecorators: {[key: string]: {type: Function, args?: any[]}[]} = {
"other": [{ type: PropDecorator },],
};
}`);

        });
      });
    });
