/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {SourceMapGenerator} from 'source-map';
import * as ts from 'typescript';

import {getDecoratorDeclarations} from './decorators';
import {getIdentifierText, Rewriter} from './rewriter';
import {SourceMapper} from './source_map_utils';
import {TypeTranslator} from './type-translator';
import {toArray} from './util';

// DecoratorClassVisitor rewrites a single "class Foo {...}" declaration.
// It's its own object because we collect decorators on the class and the ctor
// separately for each class we encounter.
export class DecoratorClassVisitor {
  /** Decorators on the class itself. */
  decorators: ts.Decorator[];
  /** The constructor parameter list and decorators on each param. */
  ctorParameters: Array<[string | undefined, ts.Decorator[]|undefined]|null>;
  /** Per-method decorators. */
  propDecorators: Map<string, ts.Decorator[]>;

  constructor(
      private typeChecker: ts.TypeChecker, private rewriter: Rewriter,
      private classDecl: ts.ClassDeclaration) {
    if (classDecl.decorators) {
      const toLower = this.decoratorsToLower(classDecl);
      if (toLower.length > 0) this.decorators = toLower;
    }
  }

  /**
   * Determines whether the given decorator should be re-written as an annotation.
   */
  private shouldLower(decorator: ts.Decorator) {
    for (const d of getDecoratorDeclarations(decorator, this.typeChecker)) {
      // Switch to the TS JSDoc parser in the future to avoid false positives here.
      // For example using '@Annotation' in a true comment.
      // However, a new TS API would be needed, track at
      // https://github.com/Microsoft/TypeScript/issues/7393.
      let commentNode: ts.Node = d;
      // Not handling PropertyAccess expressions here, because they are
      // filtered earlier.
      if (commentNode.kind === ts.SyntaxKind.VariableDeclaration) {
        if (!commentNode.parent) continue;
        commentNode = commentNode.parent;
      }
      // Go up one more level to VariableDeclarationStatement, where usually
      // the comment lives. If the declaration has an 'export', the
      // VDList.getFullText will not contain the comment.
      if (commentNode.kind === ts.SyntaxKind.VariableDeclarationList) {
        if (!commentNode.parent) continue;
        commentNode = commentNode.parent;
      }
      const range = ts.getLeadingCommentRanges(commentNode.getFullText(), 0);
      if (!range) continue;
      for (const {pos, end} of range) {
        const jsDocText = commentNode.getFullText().substring(pos, end);
        if (jsDocText.includes('@Annotation')) return true;
      }
    }
    return false;
  }

  private decoratorsToLower(n: ts.Node): ts.Decorator[] {
    if (n.decorators) {
      return n.decorators.filter((d) => this.shouldLower(d));
    }
    return [];
  }

  /**
   * gatherConstructor grabs the parameter list and decorators off the class
   * constructor, and emits nothing.
   */
  private gatherConstructor(ctor: ts.ConstructorDeclaration) {
    const ctorParameters: Array<[string | undefined, ts.Decorator[] | undefined]|null> = [];
    let hasDecoratedParam = false;
    for (const param of ctor.parameters) {
      let paramCtor: string|undefined;
      let decorators: ts.Decorator[]|undefined;
      if (param.decorators) {
        decorators = this.decoratorsToLower(param);
        hasDecoratedParam = decorators.length > 0;
      }
      if (param.type) {
        // param has a type provided, e.g. "foo: Bar".
        // Verify that "Bar" is a value (e.g. a constructor) and not just a type.
        const sym = this.typeChecker.getTypeAtLocation(param.type).getSymbol();
        if (sym && (sym.flags & ts.SymbolFlags.Value)) {
          paramCtor = new TypeTranslator(this.typeChecker, param.type)
                          .symbolToString(sym, /* useFqn */ true);
        }
      }
      if (paramCtor || decorators) {
        ctorParameters.push([paramCtor, decorators]);
      } else {
        ctorParameters.push(null);
      }
    }

    // Use the ctor parameter metadata only if the class or the ctor was decorated.
    if (this.decorators || hasDecoratedParam) {
      this.ctorParameters = ctorParameters;
    }
  }

  /**
   * gatherMethod grabs the decorators off a class method and emits nothing.
   */
  private gatherMethodOrProperty(method: ts.NamedDeclaration) {
    if (!method.decorators) return;
    if (!method.name || method.name.kind !== ts.SyntaxKind.Identifier) {
      // Method has a weird name, e.g.
      //   [Symbol.foo]() {...}
      this.rewriter.error(method, 'cannot process decorators on strangely named method');
      return;
    }

    const name = (method.name as ts.Identifier).text;
    const decorators: ts.Decorator[] = this.decoratorsToLower(method);
    if (decorators.length === 0) return;
    if (!this.propDecorators) this.propDecorators = new Map<string, ts.Decorator[]>();
    this.propDecorators.set(name, decorators);
  }

  beforeProcessNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.Constructor:
        this.gatherConstructor(node as ts.ConstructorDeclaration);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.MethodDeclaration:
        this.gatherMethodOrProperty(node as ts.Declaration);
        break;
      default:
    }
  }

  maybeProcessDecorator(node: ts.Decorator, start?: number): boolean {
    if (this.shouldLower(node)) {
      // Return true to signal that this node should not be emitted,
      // but still emit the whitespace *before* the node.
      if (!start) {
        start = node.getFullStart();
      }
      this.rewriter.writeRange(node, start, node.getStart());
      return true;
    }
    return false;
  }

  /**
   * emits the types for the various gathered metadata to be used
   * in the tsickle type annotations helper.
   */
  emitMetadataTypeAnnotationsHelpers() {
    if (!this.classDecl.name) return;
    const className = getIdentifierText(this.classDecl.name);
    if (this.decorators) {
      this.rewriter.emit(`/** @type {!Array<{type: !Function, args: (undefined|!Array<?>)}>} */\n`);
      this.rewriter.emit(`${className}.decorators;\n`);
    }
    if (this.decorators || this.ctorParameters) {
      this.rewriter.emit(`/**\n`);
      this.rewriter.emit(` * @nocollapse\n`);
      this.rewriter.emit(
          ` * @type {function(): !Array<(null|{type: ?, decorators: (undefined|!Array<{type: !Function, args: (undefined|!Array<?>)}>)})>}\n`);
      this.rewriter.emit(` */\n`);
      this.rewriter.emit(`${className}.ctorParameters;\n`);
    }
    if (this.propDecorators) {
      this.rewriter.emit(
          `/** @type {!Object<string,!Array<{type: !Function, args: (undefined|!Array<?>)}>>} */\n`);
      this.rewriter.emit(`${className}.propDecorators;\n`);
    }
  }

  /**
   * emitMetadata emits the various gathered metadata, as static fields.
   */
  emitMetadataAsStaticProperties() {
    const decoratorInvocations = '{type: Function, args?: any[]}[]';
    if (this.decorators) {
      this.rewriter.emit(`static decorators: ${decoratorInvocations} = [\n`);
      for (const annotation of this.decorators) {
        this.emitDecorator(annotation);
        this.rewriter.emit(',\n');
      }
      this.rewriter.emit('];\n');
    }

    if (this.decorators || this.ctorParameters) {
      this.rewriter.emit(`/** @nocollapse */\n`);
      // ctorParameters may contain forward references in the type: field, so wrap in a function
      // closure
      this.rewriter.emit(
          `static ctorParameters: () => ({type: any, decorators?: ` + decoratorInvocations +
          `}|null)[] = () => [\n`);
      let emittedInline = false;
      for (const param of this.ctorParameters || []) {
        if (!param) {
          if (emittedInline) {
            this.rewriter.emit(' ');
          }
          this.rewriter.emit('null,');
          emittedInline = true;
          continue;
        }
        if (emittedInline) {
          this.rewriter.emit('\n');
          emittedInline = false;
        }
        const [ctor, decorators] = param;
        this.rewriter.emit(`{type: ${ctor}, `);
        if (decorators) {
          this.rewriter.emit('decorators: [');
          for (const decorator of decorators) {
            this.emitDecorator(decorator);
            this.rewriter.emit(', ');
          }
          this.rewriter.emit(']');
        }
        this.rewriter.emit('},\n');
      }
      this.rewriter.emit(`];\n`);
    }

    if (this.propDecorators) {
      this.rewriter.emit(
          `static propDecorators: {[key: string]: ` + decoratorInvocations + `} = {\n`);
      for (const name of toArray(this.propDecorators.keys())) {
        this.rewriter.emit(`"${name}": [`);

        for (const decorator of this.propDecorators.get(name)!) {
          this.emitDecorator(decorator);
          this.rewriter.emit(',');
        }
        this.rewriter.emit('],\n');
      }
      this.rewriter.emit('};\n');
    }
  }

  private emitDecorator(decorator: ts.Decorator) {
    this.rewriter.emit('{ type: ');
    const expr = decorator.expression;
    switch (expr.kind) {
      case ts.SyntaxKind.Identifier:
        // The decorator was a plain @Foo.
        this.rewriter.visit(expr);
        break;
      case ts.SyntaxKind.CallExpression:
        // The decorator was a call, like @Foo(bar).
        const call = expr as ts.CallExpression;
        this.rewriter.visit(call.expression);
        if (call.arguments.length) {
          this.rewriter.emit(', args: [');
          for (const arg of call.arguments) {
            this.rewriter.emit(arg.getText());
            this.rewriter.emit(', ');
          }
          this.rewriter.emit(']');
        }
        break;
      default:
        this.rewriter.errorUnimplementedKind(expr, 'gathering metadata');
        this.rewriter.emit('undefined');
    }
    this.rewriter.emit(' }');
  }
}

class DecoratorRewriter extends Rewriter {
  private currentDecoratorConverter: DecoratorClassVisitor;

  constructor(
      private typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, sourceMapper?: SourceMapper) {
    super(sourceFile, sourceMapper);
  }

  process(): {output: string, diagnostics: ts.Diagnostic[]} {
    this.visit(this.file);
    return this.getOutput();
  }

  protected maybeProcess(node: ts.Node): boolean {
    if (this.currentDecoratorConverter) {
      this.currentDecoratorConverter.beforeProcessNode(node);
    }
    switch (node.kind) {
      case ts.SyntaxKind.Decorator:
        return this.currentDecoratorConverter &&
            this.currentDecoratorConverter.maybeProcessDecorator(node as ts.Decorator);
      case ts.SyntaxKind.ClassDeclaration:
        const oldDecoratorConverter = this.currentDecoratorConverter;
        this.currentDecoratorConverter =
            new DecoratorClassVisitor(this.typeChecker, this, node as ts.ClassDeclaration);
        this.writeRange(node, node.getFullStart(), node.getStart());
        visitClassContentIncludingDecorators(
            node as ts.ClassDeclaration, this, this.currentDecoratorConverter);
        this.currentDecoratorConverter = oldDecoratorConverter;
        return true;
      default:
        return false;
    }
  }
}

export function visitClassContentIncludingDecorators(
    classDecl: ts.ClassDeclaration, rewriter: Rewriter, decoratorVisitor?: DecoratorClassVisitor) {
  let pos = classDecl.getStart();
  if (decoratorVisitor) {
    // visit decorators if needed
    ts.forEachChild(classDecl, child => {
      if (child.kind !== ts.SyntaxKind.Decorator) {
        return;
      }
      // Note: The getFullStart() of the first decorator is the same
      // as the getFullStart() of the class declaration.
      // Therefore, we need to use Math.max to not print the whitespace
      // of the class again.
      const childStart = Math.max(pos, child.getFullStart());
      rewriter.writeRange(classDecl, pos, childStart);
      if (decoratorVisitor.maybeProcessDecorator(child as ts.Decorator, childStart)) {
        pos = child.getEnd();
      }
    });
  }
  if (classDecl.members.length > 0) {
    rewriter.writeRange(classDecl, pos, classDecl.members[0].getFullStart());
    for (const member of classDecl.members) {
      rewriter.visit(member);
    }
    pos = classDecl.getLastToken().getFullStart();
  }
  // At this point, we've emitted up through the final child of the class, so all that
  // remains is the trailing whitespace and closing curly brace.
  // The final character owned by the class node should always be a '}',
  // or we somehow got the AST wrong and should report an error.
  // (Any whitespace or semicolon following the '}' will be part of the next Node.)
  if (rewriter.file.text[classDecl.getEnd() - 1] !== '}') {
    rewriter.error(classDecl, 'unexpected class terminator');
  }
  rewriter.writeRange(classDecl, pos, classDecl.getEnd() - 1);
  if (decoratorVisitor) {
    decoratorVisitor.emitMetadataAsStaticProperties();
  }
  rewriter.writeRange(classDecl, classDecl.getEnd() - 1, classDecl.getEnd());
}


export function convertDecorators(
    typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile,
    sourceMapper?: SourceMapper): {output: string, diagnostics: ts.Diagnostic[]} {
  return new DecoratorRewriter(typeChecker, sourceFile, sourceMapper).process();
}
