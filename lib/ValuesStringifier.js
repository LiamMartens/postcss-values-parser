/* eslint "no-await-in-loop": "off" */
const Stringifier = require('./Stringifier');

module.exports = class ValuesStringifier extends Stringifier {
  /** @type {(
   node: import('postcss').Node,
   builder: import('postcss').Builder,
   referenceValueResolver?: (path: string) => Promise<string>
   ) => ValuesStringifier}
  */
  static async stringify(node, builder, referenceValueResolver) {
    const stringifier = new ValuesStringifier(builder, referenceValueResolver);
    await stringifier.stringify(node);
  }

  /** @type {(builder: import('postcss').Builder, referenceValueResolver?: (path: string) => Promise<string>) => ValuesStringifier} */
  constructor(builder, referenceValueResolver) {
    super(builder);
    this.referenceValueResolver = referenceValueResolver || null;
  }

  async basic(node, value) {
    const print = value || node.value;
    const after = node.raws.after ? (await this.raw(node, 'after')) || '' : '';
    // NOTE: before is handled by postcss in stringifier.body

    this.builder(print, node, 'start');
    this.builder(after, node, 'end');
  }

  async atword(...args) {
    await this.atrule(...args);
  }

  async comment(node) {
    if (node.inline) {
      const left = await this.raw(node, 'left', 'commentLeft');
      const right = await this.raw(node, 'right', 'commentRight');
      this.builder(`//${left}${node.text}${right}`, node);
    } else {
      await super.comment(node);
    }
  }

  async func(node) {
    const after = (await this.raw(node, 'after')) || '';

    this.builder(`${node.name}(`, node, 'start');

    for (const child of node.nodes) {
      // since we're duplicating this.body here, we have to handle `before`
      // but we don't want the postcss default \n value, so check it's non-empty first
      const before = child.raws.before ? await this.raw(child, 'before') : '';
      if (before) {
        this.builder(before);
      }
      await this.stringify(child);
    }

    this.builder(`)${after}`, node, 'end');
  }

  async reference(node) {
    if (node.syntax === '{}') {
      await this.basic(
        node,
        this.referenceValueResolver
          ? await this.referenceValueResolver(node.value)
          : `{${node.value}}`
      );
    } else if (node.syntax === '$') {
      await this.basic(
        node,
        this.referenceValueResolver
          ? await this.referenceValueResolver(node.value)
          : `$${node.value}`
      );
    }
  }

  async interpolation(node) {
    await this.basic(node, node.prefix + node.params);
  }

  async numeric(node) {
    const print = node.value + node.unit;
    await this.basic(node, print);
  }

  async operator(node) {
    await this.basic(node);
  }

  async punctuation(node) {
    await this.basic(node);
  }

  async quoted(node) {
    await this.basic(node);
  }

  async unicodeRange(node) {
    await this.basic(node);
  }

  async word(node) {
    await this.basic(node);
  }
};
