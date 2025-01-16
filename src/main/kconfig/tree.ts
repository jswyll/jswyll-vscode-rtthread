import * as kconfiglib from '../kconfig/kconfiglib';
import { TMenuItem } from '../../common/types/menuconfig';

/**
 * 构建菜单树的类，用于将 kconfiglib 的 MenuNode 转换为 TMenuItem。
 */
export class MenuTreeBuilder {
  /**
   * 将 MenuNode 映射到唯一 ID 的 WeakMap。
   */
  private nodeToIdMap = new WeakMap<kconfiglib.MenuNode, number>();

  /**
   * 全局 ID 计数器，用于生成唯一的节点 ID。
   */
  private globalIdCounter = 0;

  /**
   * 将唯一 ID 映射到 TMenuItem 的记录。
   */
  private nodeToMenuItemMap: Record<number, TMenuItem> = {};

  /**
   * 将唯一 ID 映射到 MenuNode 的记录。
   */
  public readonly idToNodeMap: Record<number, kconfiglib.MenuNode> = {};

  /**
   * 是否显示所有节点，即使它们不可见。
   */
  public static isShowAll = false;

  /**
   * 构造函数，初始化 MenuTreeBuilder 实例。
   *
   * @param kconfig kconfiglib 的 Kconfig 实例。
   */
  constructor(private kconfig: kconfiglib.Kconfig) {}

  /**
   * 获取节点的唯一 ID。
   *
   * @param node 要获取 ID 的 MenuNode。
   * @returns 节点的唯一 ID。
   */
  private getId(node: kconfiglib.MenuNode): number {
    if (!this.nodeToIdMap.has(node)) {
      this.nodeToIdMap.set(node, this.globalIdCounter++);
    }
    const id = this.nodeToIdMap.get(node)!;
    this.idToNodeMap[id] = node;
    return id;
  }

  /**
   * 检查节点是否可见。
   *
   * @param node 要检查的 MenuNode。
   * @returns 如果节点可见，则返回 true；否则返回 false。
   */
  private isVisible(node: kconfiglib.MenuNode): boolean {
    return (
      node.prompt !== null &&
      node.prompt.length > 0 &&
      kconfiglib.expr_value(node.prompt[1]) !== 0 &&
      !(node.item === kconfiglib.MENU && !kconfiglib.expr_value(node.visibility))
    );
  }

  /**
   * 获取菜单树节点。
   *
   * TODO: choice节点判断是否为可选的
   *
   * @param node 要添加的 MenuNode。
   * @returns 如果节点成功添加到树中，则返回 TMenuItem；否则返回 null。
   */
  private getTreeItem(node: kconfiglib.MenuNode): TMenuItem | null {
    if (!node.prompt) {
      return null;
    }

    const prompt = node.prompt[0];
    const help = node.help ?? '';
    const info = node.toString();
    if (node.item === kconfiglib.MENU) {
      return {
        type: 'MENU',
        id: this.getId(node),
        name: prompt,
        prompt,
        controlValue: '',
        help,
        info,
        children: [],
      };
    } else if (node.item === kconfiglib.COMMENT) {
      return {
        type: 'COMMENT',
        id: this.getId(node),
        name: prompt,
        prompt: `*** ${prompt} ***`,
        controlValue: '',
        help,
        info,
        children: [],
      };
    } else if (node.item instanceof kconfiglib.Sym) {
      const sym = node.item;
      if (sym.type === kconfiglib.BOOL) {
        return {
          type: 'BOOL',
          id: this.getId(node),
          name: sym.name,
          prompt,
          controlValue: sym.bool_value === kconfiglib.STR_TO_BOOL.y,
          help,
          info,
          children: [],
        };
      } else if (sym.orig_type === kconfiglib.STRING) {
        return {
          type: 'STRING',
          id: this.getId(node),
          name: sym.name,
          prompt,
          controlValue: sym.str_value,
          help,
          info,
          children: [],
        };
      } else if (sym.orig_type === kconfiglib.INT) {
        let range: [number, number] | null = null;
        for (const [low, high, cond] of sym.ranges) {
          if (kconfiglib.expr_value(cond)) {
            range = [parseInt(low.str_value), parseInt(high.str_value)];
          }
        }
        return {
          type: 'INT',
          id: this.getId(node),
          name: sym.name,
          prompt,
          controlValue: parseInt(sym.str_value, 10),
          range,
          help,
          info,
          children: [],
        };
      } else if (sym.orig_type === kconfiglib.HEX) {
        let range: [number, number] | null = null;
        for (const [low, high, cond] of sym.ranges) {
          if (kconfiglib.expr_value(cond)) {
            range = [parseInt(low.str_value), parseInt(high.str_value)];
          }
        }
        let controlValue = sym.str_value;
        if (!controlValue.startsWith('0x') && !controlValue.startsWith('0X')) {
          controlValue = '0x' + controlValue;
        }
        return {
          type: 'HEX',
          id: this.getId(node),
          name: sym.name,
          prompt,
          controlValue,
          range,
          help,
          info,
          children: [],
        };
      }
    } else if (node.item instanceof kconfiglib.Choice && node.item.bool_value === 2) {
      let controlValue = undefined;
      const sym = node.item.selection;
      if (sym) {
        for (const symNode of sym.nodes) {
          if (symNode.parent === node && symNode.prompt) {
            controlValue = symNode.prompt[0];
            break;
          }
        }
        if (controlValue === undefined) {
          for (const symNode of sym.nodes) {
            if (symNode.prompt) {
              controlValue = symNode.prompt[0];
              break;
            }
          }
        }
      }
      return {
        type: 'CHOICE',
        id: this.getId(node),
        name: prompt,
        prompt,
        controlValue,
        help,
        info,
        children: [],
        options: [],
      };
    }

    return null;
  }

  /**
   * 递归获取所有显示的节点。
   *
   * @param node 要检查的 MenuNode。
   * @returns 显示的 MenuNode 数组。
   */
  private recShownFullNodes(node: kconfiglib.MenuNode | null): kconfiglib.MenuNode[] {
    const result: kconfiglib.MenuNode[] = [];
    while (node) {
      if (this.isVisible(node) || MenuTreeBuilder.isShowAll) {
        result.push(node);

        if (node.list && node.item instanceof kconfiglib.Sym) {
          result.push(...this.recShownFullNodes(node.list));
        }
      } else if (node.list && node.item instanceof kconfiglib.Sym) {
        const shownChildren = this.recShownFullNodes(node.list);
        if (shownChildren.length > 0) {
          result.push(node, ...shownChildren);
        }
      }
      node = node.next;
    }
    return result;
  }

  /**
   * 获取所有显示的节点。
   *
   * @param menuNode 要检查的 MenuNode。
   * @returns 显示的 MenuNode 数组。
   */
  private shownFullNodes(menuNode: kconfiglib.MenuNode): kconfiglib.MenuNode[] {
    return this.recShownFullNodes(menuNode.list);
  }

  /**
   * 构建完整的菜单树。
   *
   * @param menuNode 要构建的 MenuNode。
   * @param topTree 顶级菜单树数组。
   */
  private buildFullTree(menuNode: kconfiglib.MenuNode, topTree: TMenuItem[]) {
    for (const node of this.shownFullNodes(menuNode)) {
      const treeItem = this.getTreeItem(node);
      if (treeItem) {
        const parent = node.parent;
        if (parent === null || parent === this.kconfig.top_node) {
          topTree.push(treeItem);
        } else {
          const parentTreeNode = this.nodeToMenuItemMap[this.getId(parent)];
          if (!parentTreeNode) {
            topTree.push(treeItem);
          } else {
            parentTreeNode.children.push(treeItem);
          }
        }
        const nodeId = this.getId(node);
        this.nodeToMenuItemMap[nodeId] = treeItem;
      }
      if (node.list && !(node.item instanceof kconfiglib.Sym)) {
        this.buildFullTree(node, topTree);
      }
    }
  }

  /**
   * 最终化菜单树，处理 CHOICE 类型的节点。
   *
   * @param menus 要最终化的菜单树数组。
   */
  private finalizeTree(menus: TMenuItem[]) {
    for (const menu of menus) {
      if (menu.type === 'CHOICE') {
        menu.options = menu.children;
        menu.children = [];
      }
      if (menu.children.length > 0) {
        this.finalizeTree(menu.children);
      }
    }
  }

  /**
   * 构建并返回菜单树。
   *
   * @returns 构建好的菜单树数组。
   */
  public build(): TMenuItem[] {
    const menus: TMenuItem[] = [];
    this.buildFullTree(this.kconfig.top_node, menus);
    this.finalizeTree(menus);
    return menus;
  }
}
