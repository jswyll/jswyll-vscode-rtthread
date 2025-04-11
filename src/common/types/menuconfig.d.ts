/**
 * 菜单类型
 */
export type MenuItemType = 'MENU' | 'STRING' | 'BOOL' | 'INT' | 'HEX' | 'CHOICE' | 'COMMENT';

/**
 * Symbol或Choice的值的类型
 */
export declare type TMenuItemValue = string | boolean | number;

/**
 * 菜单项的公共字段
 */
export interface MenuItemBase<T extends TMenuItemValue = TMenuItemValue> {
  /**
   * 类型
   */
  type: MenuItemType;

  /**
   * 标题，例如`Maximal size of kernel object name`
   */
  prompt: string;

  /**
   * 翻译后的标题
   */
  translatedPrompt?: string;

  /**
   * 编号
   */
  id: number;

  /**
   * 名称，例如`RT_NAME_MAX`
   */
  name: string;

  /**
   * Symbol或Choice的控件值，例如`16`
   */
  controlValue: T;

  /**
   * 帮助信息，例如`The maximal size of kernel object name`。不存在时为空字符串。
   */
  help: string;

  /**
   * 翻译后的帮助信息
   */
  translatedHelp?: string;

  /**
   * 信息
   */
  info: string;

  /**
   * 子菜单
   */
  children: TMenuItem[];
}

/**
 * 菜单项 - 菜单
 */
export interface MenuItemMenu extends MenuItemBase<string> {
  type: 'MENU';
}

/**
 * 菜单项 - 字符串
 */
export interface MenuItemString extends MenuItemBase<string> {
  type: 'STRING';
}

/**
 * 菜单项 - 布尔
 */
export interface MenuItemBool extends MenuItemBase<boolean> {
  type: 'BOOL';
}

/**
 * 菜单项 - 整数
 */
export interface MenuItemInt extends MenuItemBase<number> {
  type: 'INT';
  /**
   * 数字范围，例如`[2, 64]`
   */
  range: [number, number] | null;
}

/**
 * 菜单项 - 十六进制
 */
export interface MenuItemHex extends MenuItemBase<string> {
  type: 'HEX';
  /**
   * 数字范围，例如`[2, 64]`
   */
  range: [number, number] | null;
}

/**
 * 菜单项 - 选择
 */
export interface MenuItemChoice<T = TMenuItemValue | undefined> extends MenuItemBase<T> {
  type: 'CHOICE';
  /**
   * 选项
   */
  options: TMenuItem[];
}

/**
 * 菜单项 - 注释
 */
export interface MenuItemComment extends MenuItemBase<string> {
  type: 'COMMENT';
}

/**
 * 菜单项
 */
export declare type TMenuItem =
  | MenuItemMenu
  | MenuItemString
  | MenuItemBool
  | MenuItemInt
  | MenuItemHex
  | MenuItemChoice
  | MenuItemComment;
