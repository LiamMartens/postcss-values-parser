const { registerWalker } = require('../walker');

const Node = require('./Node');

class Reference extends Node {
  constructor(options) {
    super(options);
    this.type = 'reference';
    // can be either '$' or '{}'
    this.syntax = options.syntax;
    this.value = options.value;
    this.path = this.value.trim().split('.');
  }

  static test(tokens) {
    return (
      (tokens.length > 2 &&
        tokens[0][0] === '{' &&
        tokens[1][0] === 'word' &&
        tokens[2][0] === '}') ||
      (tokens.length > 0 && tokens[0][0] === 'word' && tokens[0][1].match(/^\$[^$\s]+$/))
    );
  }

  static fromTokens(tokens, parser) {
    const [first] = tokens.splice(0, 1);
    const [, , startLine, startChar] = first;
    /** @type {{ referencePathResolver: null | (path: string) => string }} */
    const { referencePathResolver } = parser.options;

    if (first[0] === '{') {
      const [[, identifier]] = tokens.splice(0, 1);
      const node = new Reference({
        syntax: '{}',
        value: referencePathResolver ? referencePathResolver(identifier) : identifier
      });

      parser.init(node, startLine, startChar);
      parser.current = node; // eslint-disable-line no-param-reassign

      if (tokens[0][0] !== '}') {
        parser.unclosedBracket(first);
      }

      parser.end(tokens[0]);
      parser.back(tokens.slice(1));
    } else {
      const [, value] = first;
      const identifier = value.replace(/^\$/, '');
      const node = new Reference({
        syntax: '$',
        value: referencePathResolver ? referencePathResolver(identifier) : identifier
      });
      parser.init(node, startLine, startChar);
      parser.current = node; // eslint-disable-line no-param-reassign
      parser.end(first);
      parser.back(tokens);
    }
  }
}

registerWalker(Reference);

module.exports = Reference;
