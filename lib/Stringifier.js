/* eslint "no-await-in-loop": "off" */
/* eslint "class-methods-use-this": "off" */
/* eslint "consistent-return": "off" */
// @README copied from PostCSS
const DEFAULT_RAW = {
  colon: ': ',
  indent: '    ',
  beforeDecl: '\n',
  beforeRule: '\n',
  beforeOpen: ' ',
  beforeClose: '\n',
  beforeComment: '\n',
  after: '\n',
  emptyBody: '',
  commentLeft: ' ',
  commentRight: ' ',
  semicolon: false
};

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1);
}

class Stringifier {
  constructor(builder) {
    this.builder = builder;
  }

  async stringify(node, semicolon) {
    /* istanbul ignore if */
    if (!this[node.type]) {
      throw new Error(
        `Unknown AST node type ${node.type}. Maybe you need to change PostCSS stringifier.`
      );
    }
    await this[node.type](node, semicolon);
  }

  async root(node) {
    await this.body(node);
    if (node.raws.after) this.builder(node.raws.after);
  }

  async comment(node) {
    const left = await this.raw(node, 'left', 'commentLeft');
    const right = await this.raw(node, 'right', 'commentRight');
    this.builder(`/*${left}${node.text}${right}*/`, node);
  }

  async decl(node, semicolon) {
    const between = await this.raw(node, 'between', 'colon');
    let string = node.prop + between + (await this.rawValue(node, 'value'));

    if (node.important) {
      string += node.raws.important || ' !important';
    }

    if (semicolon) string += ';';
    this.builder(string, node);
  }

  async rule(node) {
    await this.block(node, this.rawValue(node, 'selector'));
    if (node.raws.ownSemicolon) {
      this.builder(node.raws.ownSemicolon, node, 'end');
    }
  }

  async atrule(node, semicolon) {
    let name = `@${node.name}`;
    const params = node.params ? this.rawValue(node, 'params') : '';

    if (typeof node.raws.afterName !== 'undefined') {
      name += node.raws.afterName;
    } else if (params) {
      name += ' ';
    }

    if (node.nodes) {
      await this.block(node, name + params);
    } else {
      const end = (node.raws.between || '') + (semicolon ? ';' : '');
      this.builder(name + params + end, node);
    }
  }

  async body(node) {
    let last = node.nodes.length - 1;
    while (last > 0) {
      if (node.nodes[last].type !== 'comment') break;
      last -= 1;
    }

    const semicolon = await this.raw(node, 'semicolon');
    for (let i = 0; i < node.nodes.length; i++) {
      const child = node.nodes[i];
      const before = await this.raw(child, 'before');
      if (before) this.builder(before);
      await this.stringify(child, last !== i || semicolon);
    }
  }

  async block(node, start) {
    const between = await this.raw(node, 'between', 'beforeOpen');
    this.builder(`${start + between}{`, node, 'start');

    let after;
    if (node.nodes && node.nodes.length) {
      await this.body(node);
      after = await this.raw(node, 'after');
    } else {
      after = await this.raw(node, 'after', 'emptyBody');
    }

    if (after) this.builder(after);
    this.builder('}', node, 'end');
  }

  async raw(node, own, detect) {
    let value;
    if (!detect) detect = own;

    // Already had
    if (own) {
      value = node.raws[own];
      if (typeof value !== 'undefined') return value;
    }

    const { parent } = node;

    // Hack for first rule in CSS
    if (detect === 'before') {
      if (!parent || (parent.type === 'root' && parent.first === node)) {
        return '';
      }
    }

    // Floating child without parent
    if (!parent) return DEFAULT_RAW[detect];

    // Detect style by other nodes
    const root = node.root();
    if (!root.rawCache) root.rawCache = {};
    if (typeof root.rawCache[detect] !== 'undefined') {
      return root.rawCache[detect];
    }

    if (detect === 'before' || detect === 'after') {
      return this.beforeAfter(node, detect);
    }
    const method = `raw${capitalize(detect)}`;
    if (this[method]) {
      value = await this[method](root, node);
    } else {
      root.walk((i) => {
        value = i.raws[own];
        if (typeof value !== 'undefined') return false;
      });
    }

    if (typeof value === 'undefined') value = DEFAULT_RAW[detect];

    root.rawCache[detect] = value;
    return value;
  }

  rawSemicolon(root) {
    let value;
    root.walk((i) => {
      if (i.nodes && i.nodes.length && i.last.type === 'decl') {
        value = i.raws.semicolon;
        if (typeof value !== 'undefined') return false;
      }
    });
    return value;
  }

  rawEmptyBody(root) {
    let value;
    root.walk((i) => {
      if (i.nodes && i.nodes.length === 0) {
        value = i.raws.after;
        if (typeof value !== 'undefined') return false;
      }
    });
    return value;
  }

  rawIndent(root) {
    if (root.raws.indent) return root.raws.indent;
    let value;
    root.walk((i) => {
      const p = i.parent;
      if (p && p !== root && p.parent && p.parent === root) {
        if (typeof i.raws.before !== 'undefined') {
          const parts = i.raws.before.split('\n');
          value = parts[parts.length - 1];
          value = value.replace(/\S/g, '');
          return false;
        }
      }
    });
    return value;
  }

  async rawBeforeComment(root, node) {
    let value;
    root.walkComments((i) => {
      if (typeof i.raws.before !== 'undefined') {
        value = i.raws.before;
        if (value.includes('\n')) {
          value = value.replace(/[^\n]+$/, '');
        }
        return false;
      }
    });
    if (typeof value === 'undefined') {
      value = await this.raw(node, null, 'beforeDecl');
    } else if (value) {
      value = value.replace(/\S/g, '');
    }
    return value;
  }

  async rawBeforeDecl(root, node) {
    let value;
    root.walkDecls((i) => {
      if (typeof i.raws.before !== 'undefined') {
        value = i.raws.before;
        if (value.includes('\n')) {
          value = value.replace(/[^\n]+$/, '');
        }
        return false;
      }
    });
    if (typeof value === 'undefined') {
      value = await this.raw(node, null, 'beforeRule');
    } else if (value) {
      value = value.replace(/\S/g, '');
    }
    return value;
  }

  rawBeforeRule(root) {
    let value;
    root.walk((i) => {
      if (i.nodes && (i.parent !== root || root.first !== i)) {
        if (typeof i.raws.before !== 'undefined') {
          value = i.raws.before;
          if (value.includes('\n')) {
            value = value.replace(/[^\n]+$/, '');
          }
          return false;
        }
      }
    });
    if (value) value = value.replace(/\S/g, '');
    return value;
  }

  rawBeforeClose(root) {
    let value;
    root.walk((i) => {
      if (i.nodes && i.nodes.length > 0) {
        if (typeof i.raws.after !== 'undefined') {
          value = i.raws.after;
          if (value.includes('\n')) {
            value = value.replace(/[^\n]+$/, '');
          }
          return false;
        }
      }
    });
    if (value) value = value.replace(/\S/g, '');
    return value;
  }

  rawBeforeOpen(root) {
    let value;
    root.walk((i) => {
      if (i.type !== 'decl') {
        value = i.raws.between;
        if (typeof value !== 'undefined') return false;
      }
    });
    return value;
  }

  rawColon(root) {
    let value;
    root.walkDecls((i) => {
      if (typeof i.raws.between !== 'undefined') {
        value = i.raws.between.replace(/[^\s:]/g, '');
        return false;
      }
    });
    return value;
  }

  async beforeAfter(node, detect) {
    let value;
    if (node.type === 'decl') {
      value = await this.raw(node, null, 'beforeDecl');
    } else if (node.type === 'comment') {
      value = await this.raw(node, null, 'beforeComment');
    } else if (detect === 'before') {
      value = await this.raw(node, null, 'beforeRule');
    } else {
      value = await this.raw(node, null, 'beforeClose');
    }

    let buf = node.parent;
    let depth = 0;
    while (buf && buf.type !== 'root') {
      depth += 1;
      buf = buf.parent;
    }

    if (value.includes('\n')) {
      const indent = await this.raw(node, null, 'indent');
      if (indent.length) {
        for (let step = 0; step < depth; step++) value += indent;
      }
    }

    return value;
  }

  rawValue(node, prop) {
    const value = node[prop];
    const raw = node.raws[prop];
    if (raw && raw.value === value) {
      return raw.raw;
    }

    return value;
  }
}

module.exports = Stringifier;
