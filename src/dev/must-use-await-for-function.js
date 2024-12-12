const mustUseAwaitForFunction = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce the use of await or .then for specific functions',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: null,
    schema: [
      {
        type: 'array',
        items: [
          {
            type: 'object',
            properties: {
              objectName: {
                type: 'string',
              },
              functionName: {
                type: 'string',
              },
            },
            required: ['functionName'],
            additionalProperties: false,
          },
        ],
      },
    ],
  },
  create(context) {
    const options = context.options[0] || [];
    const targetFunctions = options.map(option => ({
      objectName: option.objectName || null,
      functionName: option.functionName,
    }));

    function isTargetFunction(node, functionName, objectName) {
      if (objectName) {
        return (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === objectName &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === functionName
        );
      } else {
        return (
          node.callee.type === 'Identifier' &&
          node.callee.name === functionName
        );
      }
    }

    function hasAwaitOrThen(node) {
      let currentNode = node;
      while (currentNode) {
        if (currentNode.type === 'AwaitExpression') {
          return true;
        }
        if (
          currentNode.type === 'CallExpression' &&
          currentNode.callee?.type === 'MemberExpression' &&
          currentNode.callee.property?.type === 'Identifier' &&
          currentNode.callee.property.name === 'then'
        ) {
          return true;
        }
        currentNode = currentNode.parent;
      }

      return false;
    }

    return {
      CallExpression(node) {
        for (const { functionName, objectName } of targetFunctions) {
          if (isTargetFunction(node, functionName, objectName)) {
            if (!hasAwaitOrThen(node.parent)) {
              context.report({
                node,
                message: `The function '${objectName ? `${objectName}.` : ''}${functionName}' must be called with await or .then`,
              });
            }
            break;
          }
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'must-use-await-for-function': mustUseAwaitForFunction,
  },
};
