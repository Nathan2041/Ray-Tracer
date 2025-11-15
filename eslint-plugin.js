/** @type {import('eslint').ESLint.Plugin} */

export default {
  rules: {
    'explicit-typing': {
      meta: {
        type: /** @type {const} */ ('suggestion'),
        docs: { 
          description: 'Require explicit typing via annotation or assertion',
          recommended: false
        },
        messages: { 
          missingType: 'Variable must have explicit type annotation or assertion',
          missingReturnType: 'Function must have explicit return type annotation'
        },
        schema: []
      },
      create(context) { return {
        VariableDeclarator(node) {
            if (node.id.type === 'Identifier' && ['i', 'j', 'k', 'l'].includes(node.id.name)) { return }
            if (node.parent && node.parent.type === 'ForOfStatement') { return }

            let hasFunction = node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression');
            let hasVarType = node.id.typeAnnotation;
            let hasFuncReturnType = hasFunction && node.init.returnType;
          
            if (hasFunction && !hasVarType && !hasFuncReturnType) {
                context.report({ node: node.id, messageId: 'missingType' });
            } else if (!hasFunction && !hasVarType && node.id.type === 'Identifier') {
            
            let isNewExpression = node.init && node.init.type === 'NewExpression';
            
            if (!node.init || (!isNewExpression && node.init.type !== 'TSAsExpression' && node.init.type !== 'TSTypeAssertion')) {
              context.report({ node: node.id, messageId: 'missingType' });
            }
          }
        },
        
        FunctionDeclaration(node) {
          if (!node.returnType) {
            context.report({ node, messageId: 'missingReturnType' });
          }
        }
      } }
    },
  
    'require-braces': {
      meta: {
        type: /** @type {const} */ ('suggestion'),
        docs: {
            description: 'Require braces for all control statements',
            recommended: false
        },
        messages: {
            missingBraces: 'Control statement must use braces'
        },
        schema: []
      },
      create(context) {
        return {
          IfStatement(node) {
            if (node.consequent.type !== 'BlockStatement') {
              context.report({ node, messageId: 'missingBraces' });
            }
            if (node.alternate && node.alternate.type !== 'BlockStatement' && node.alternate.type !== 'IfStatement') {
              context.report({ node: node.alternate, messageId: 'missingBraces' });
            }
          },
          WhileStatement(node) {
            if (node.body.type !== 'BlockStatement') {
              context.report({ node, messageId: 'missingBraces' });
            }
          },
          ForStatement(node) {
            if (node.body.type !== 'BlockStatement') {
              context.report({ node, messageId: 'missingBraces' });
            }
          },
          ForInStatement(node) {
            if (node.body.type !== 'BlockStatement') {
              context.report({ node, messageId: 'missingBraces' });
            }
          },
          ForOfStatement(node) {
            if (node.body.type !== 'BlockStatement') {
              context.report({ node, messageId: 'missingBraces' });
            }
          }
        };
      }
    }

  }
};