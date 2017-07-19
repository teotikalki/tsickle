import * as ts from 'typescript';

export function transformer(context: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
  const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
    switch (node.kind) {
      case ts.SyntaxKind.VariableStatement:
        const vs = node as ts.VariableStatement;
        for (const declaration of vs.declarationList.declarations) {
          ts.addSyntheticLeadingComment(declaration, ts.SyntaxKind.MultiLineCommentTrivia, "@type {?}", false);
          const comments = ts.getSyntheticLeadingComments(declaration);
        }
        return node;
      default:
        return ts.visitEachChild(node, visitor, context);
    }
  };

  const transformer: ts.Transformer<ts.SourceFile> = (sf: ts.SourceFile) =>
      ts.visitNode(sf, visitor);

  return transformer;
}
