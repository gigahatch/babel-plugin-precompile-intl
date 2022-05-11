import { declare } from "@babel/helper-plugin-utils";
import { parse } from '@formatjs/icu-messageformat-parser';

const HELPERS_MAP = {
  1: "__interpolate",
  2: "__number",
  3: "__date",
  4: "__time",
  5: "__select",
  6: "__plural",
};
const PLURAL_ABBREVIATIONS = {
  zero: 'z',
  one: 'o',
  two: 't',
  few: 'f',
  many: 'm',
  other: 'h'
};

export default function build(runtimeImportPath = "precompile-intl-runtime") {
  return declare(({ types: t, assertVersion }, options) => {
    assertVersion("^7.0");
    let usedHelpers = new Set();
    let currentFunctionParams = new Set();
    let pluralsStack = [];

    function normalizePluralKey(key) {
      key = key.trim();
      let match = key.match(/^=(\d+)/);
      if (match) return parseInt(match[1], 10);
      return PLURAL_ABBREVIATIONS[key] || key;
    }

    function normalizeKey(key) {
      key = key.trim();
      let match = key.match(/^=(\d)/);
      if (match) return parseInt(match[1], 10);
      return key;
    }

    function buildCallExpression(entry) {
      let fnName = HELPERS_MAP[entry.type];
      usedHelpers.add(fnName === "__plural" && entry.offset !== 0 ? '__offsetPlural' : fnName);
      if (fnName === "__number") {
        return buildNumberCallExpression(entry);
      }
      if (fnName === "__interpolate" || fnName === "__date" || fnName === "__time") {
        let callArgs = [t.identifier(entry.value)];
        currentFunctionParams.add(entry.value);
        if (entry.style) callArgs.push(t.stringLiteral(entry.style));
        return t.callExpression(t.identifier(fnName), callArgs);
      }
      if (fnName === '__plural') {
        pluralsStack.push(entry)
      }
      let options = t.objectExpression(
        Object.keys(entry.options).map(key => {
          let objValueAST = entry.options[key].value;
          let objValue;
          if (objValueAST.length === 1 && objValueAST[0].type === 0) {
            objValue = t.stringLiteral(objValueAST[0].value);
          } else {
            objValue = objValueAST.length === 1 ? buildCallExpression(objValueAST[0]) : buildTemplateLiteral(objValueAST);
          }
          let normalizedKey = fnName === '__plural' ? normalizePluralKey(key) : normalizeKey(key);
          return t.objectProperty(
            typeof normalizedKey === "number"
              ? t.numericLiteral(normalizedKey)
              : t.identifier(normalizedKey),
            objValue
          );
        })
      );
      if (fnName === "__plural") {
        pluralsStack.pop();
      }
      currentFunctionParams.add(entry.value);
      let fnIdentifier = t.identifier(fnName);
      let callArguments = [t.identifier(entry.value)];
      if (fnName === "__plural" && entry.offset !== 0) {
        fnIdentifier =  t.identifier("__offsetPlural");
        callArguments.push(t.numericLiteral(entry.offset));
      }
      callArguments.push(options)
      return t.callExpression(fnIdentifier, callArguments);
    }

    function buildNumberCallExpression(entry) {
      let callArgs = [];
      if (entry.style?.parsedOptions?.scale) {
        // For number skeletons containing `scale/100` and similar, which is not an option I18n understand,
        // it replaces `__number(n, options) by `__number(n / 100, options)`.
        callArgs.push(
          t.binaryExpression("/", t.identifier(entry.value), t.numericLiteral(entry.style.parsedOptions.scale))
        );
        delete entry.style.parsedOptions.scale
      } else {
        callArgs.push(t.identifier(entry.value));
      }
      currentFunctionParams.add(entry.value);
      if (entry.style) {
        if (typeof entry.style === 'string') {
          // TODO: Special rule for 'percent' ?
          callArgs.push(t.stringLiteral(entry.style))
        } else {
          // TODO: Being a compiler gives us the chance to be better at some things than other libraries
          // For instance, when using `{style: 'unit', unit: XXXXX}` unit can only be one of a known list of units
          // (see https://stackoverflow.com/questions/68035616/invalid-unit-argument-for-intl-numberformat-with-electric-units-volt-joule)
          // Any unit but those will throw a runtime error, but we could error or at least show a warning to the user
          // when invalid. P.e. a common mistake could be to use `unit: 'km'` (wrong) instead of the correct (`unit: 'kilometer'`).
          let options = t.objectExpression(
            Object.keys(entry.style.parsedOptions).map(key => {
              let val = entry.style.parsedOptions[key]
              return t.objectProperty(
                t.identifier(key),
                typeof val === "number" ? t.numericLiteral(val) : t.stringLiteral(val),
              );
            })
          );
          callArgs.push(options);
        }
      }
      return t.callExpression(t.identifier('__number'), callArgs);
    }

    function buildTemplateLiteral(ast) {
      let quasis = [];
      let expressions = [];
      for (let i = 0; i < ast.length; i++) {
        let entry = ast[i];
        switch(entry.type) {
          case 0: // literal
            quasis.push(
              t.templateElement(
                { value: entry.value, raw: entry.value },
                i === ast.length - 1 // tail
              )
            );
            break;
          case 1: // intepolation
            expressions.push(buildCallExpression(entry));
            currentFunctionParams.add(entry.value);
            if (i === 0) quasis.push(t.templateElement({ value: '', raw: '' }, false));
            break;
          case 2: // Number format
            expressions.push(buildCallExpression(entry));
            currentFunctionParams.add(entry.value);
            break;
          case 3: // Date format
            expressions.push(buildCallExpression(entry));
            currentFunctionParams.add(entry.value);
            break;
          case 4: // Time format
            expressions.push(buildCallExpression(entry));
            currentFunctionParams.add(entry.value);
            break;
          case 5: // select
            expressions.push(buildCallExpression(entry));
            break;
          case 6: // plural
            expressions.push(buildCallExpression(entry));
            break;
          case 7: // # interpolation
            let lastPlural = pluralsStack[pluralsStack.length - 1];
            if (lastPlural.offset !== null && lastPlural.offset !== 0) {
              expressions.push(
                t.binaryExpression(
                  "-",
                  t.identifier(lastPlural.value),
                  t.numericLiteral(lastPlural.offset)
                )
              );
            } else {
              expressions.push(t.identifier(lastPlural.value));
            }
            if (i === 0) quasis.push(t.templateElement({ value: '', raw: '' }, false));
            break;
          default:
            debugger;
        }
        if (i === ast.length - 1 && entry.type !== 0) {
          quasis.push(t.templateElement({ value: '', raw: '' }, true));
        }
      }
      // If the number of quasis must be one more than the number of expressions (because expressions go
      // in between). If that's not the case it means we need an empty string as first quasis.
      if (quasis.length === expressions.length) {
        quasis.unshift(t.templateElement({ value: '', raw: '' }, false));
      }
      return t.templateLiteral(quasis, expressions);
    }

    function buildFunction(ast) {
      currentFunctionParams = new Set();
      pluralsStack = [];
      let body = ast.length === 1 ? buildCallExpression(ast[0]) : buildTemplateLiteral(ast);
      return t.arrowFunctionExpression(
        Array.from(currentFunctionParams).sort().map(p => t.identifier(p)),
        body
      );
    }

    function flattenObjectProperties(object, propsArray, currentPrefix) {
      return object.properties.forEach(op => {
        let keyIsStringLiteral = t.isStringLiteral(op.key);
        let name = keyIsStringLiteral ? op.key.value : op.key.name;
        keyIsStringLiteral = keyIsStringLiteral || !!currentPrefix;
        name = currentPrefix ? currentPrefix + '.' + name : name;
        if (t.isObjectExpression(op.value)) {
          flattenObjectProperties(op.value, propsArray, name);
        } else {
          let key = keyIsStringLiteral ? t.stringLiteral(name) : t.identifier(name);
          propsArray.push([key, op.value]);
        }
      });
    }
    return {
      name: "precompile-intl",

      visitor: {
        Program: {
          enter() {
            usedHelpers = new Set();
          },
          exit(path) {
            if (usedHelpers.size > 0) {
              let importDeclaration = t.importDeclaration(
                Array.from(usedHelpers).sort().map(name => t.importSpecifier(t.identifier(name), t.identifier(name)))
              , t.stringLiteral(runtimeImportPath));
              path.unshiftContainer("body", importDeclaration);
            }
          }
        },
        ObjectProperty({ node }) {
          if (t.isStringLiteral(node.value)) {
            let icuAST = parse(node.value.value, {ignoreTag: true});
            if (icuAST.length === 1 && icuAST[0].type === 0) return;
            node.value = buildFunction(icuAST);
          }
        },
        VariableDeclarator({ node }) {
          if (t.isStringLiteral(node.init)) {
            let icuAST = parse(node.init.value);
            if (icuAST.length === 1 && icuAST[0].type === 0) return;
            node.init = buildFunction(icuAST);
          }
        },
        ExportDefaultDeclaration({ node }) {
          let properties = [];
          flattenObjectProperties(node.declaration, properties);
          node.declaration = t.objectExpression(
            properties.map(([k, v]) => {
              t.objectProperty(k,v)
              if (t.isIdentifier(k) && t.isIdentifier(v) && k.name === v.name) {
                return t.objectProperty(k, v, false, true);
              } else {
                return t.objectProperty(k,v)
              }
            })
          );
        }
      }
    };
  });
};