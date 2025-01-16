/**
 * @fileoverview This is a TypeScript reimplementation of the original Python code
 * (https://github.com/espressif/esp-idf-kconfig/blob/47c1fa6af74ae48357ff91eb1c14e223ec52b1ef/kconfiglib/core.py).
 *
 * The original Python code is licensed under the ISC License, which can be found
 * in the original repository. This TypeScript version is released under the Apache 2.0 License.
 *
 * Copyright (c) 2011-2019, Ulf Magnusson
 * Copyright (c) 2024, Espressif Systems (Shanghai) CO LTD
 * Copyright (c) 2025, jswyll
 *
 * This TypeScript code is a reimplementation and may have modifications and improvements.
 *
 * @author jswyll
 * @copyright 2025 jswyll
 * @license Apache-2.0
 *
 * @see https://opensource.org/licenses/ISC for ISC License details
 * @see https://opensource.org/licenses/Apache-2.0 for Apache 2.0 License details
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, isAbsolute, join, resolve, sep } from 'path';

export type TKconfigExpr = Sym | [number, Sym | Choice | TKconfigExpr, Sym | Choice | TKconfigExpr];
export type TKconfigType = number;
export type TKconfigPrompt = [string, Sym | TKconfigExpr];
export type TKconfigSymbolValue = 0 | 2 | string;
export type TKconfigSymbolDep = Sym | Choice | TKconfigExpr;
export type TKconfigMenuNodeItem = Sym | Choice | typeof MENU | typeof COMMENT | null;

class Logger {
  private tag = 'kconfiglib';
  private console = console;
  public isLogVerbose = false;

  private consoleLog(logFn: (...args: unknown[]) => void, ...args: unknown[]) {
    logFn(`[${this.tag}]`, ...args);
  }

  public verbose(message: string, ...args: unknown[]) {
    if (!this.isLogVerbose) {
      return;
    }
    this.consoleLog(this.console.debug, message, ...args);
  }

  public debug(message: string, ...args: unknown[]) {
    this.consoleLog(this.console.debug, message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.consoleLog(this.console.info, message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.consoleLog(this.console.warn, message, ...args);
  }

  error(...args: unknown[]) {
    this.consoleLog(this.console.error, ...args);
  }
}

const logger = new Logger();

//
// Global constants
//

export const BOOL_TO_STR: { [key: number]: string } = {
  0: 'n',
  2: 'y',
};

export const STR_TO_BOOL: { [key: string]: number } = {
  n: 0,
  y: 2,
};

/**
 * Constant representing that there's no cached choice selection. This is
 * distinct from a cached None (no selection). Any object that's not None or a
 * Sym will do. We test this with 'is'.
 */
const _T_NO_CACHED_SELECTION = 0;

const _T_ALLNOCONFIG_Y = 1;
const _T_AND = 2;
const _T_BOOL = 3;
const _T_CHOICE = 4;
const _T_CLOSE_PAREN = 5;
const _T_COMMENT = 6;
const _T_CONFIG = 7;
const _T_DEFAULT = 8;
const _T_DEFCONFIG_LIST = 9;
const _T_DEPENDS = 15;
const _T_ENDCHOICE = 16;
const _T_ENDIF = 17;
const _T_ENDMENU = 18;
const _T_ENV = 19;
const _T_EQUAL = 20;
const _T_GREATER = 21;
const _T_GREATER_EQUAL = 22;
const _T_HELP = 23;
const _T_HEX = 24;
const _T_IF = 25;
const _T_IMPLY = 26;
const _T_INT = 27;
const _T_LESS = 28;
const _T_LESS_EQUAL = 29;
const _T_MAINMENU = 30;
const _T_MENU = 31;
const _T_MENUCONFIG = 32;
const _T_NOT = 34;
const _T_ON = 35;
const _T_OPEN_PAREN = 36;
const _T_OPTION = 37;
const _T_OPTIONAL = 38;
const _T_OR = 39;
const _T_ORSOURCE = 40;
const _T_OSOURCE = 41;
const _T_PROMPT = 42;
const _T_RANGE = 43;
const _T_RSOURCE = 44;
const _T_SELECT = 45;
const _T_SOURCE = 46;
const _T_STRING = 47;
const _T_TRISTATE = 48;
const _T_UNEQUAL = 49;
const _T_VISIBLE = 50;

const _get_keyword = (keyword: string): number => {
  const keywordMap: { [key: string]: number } = {
    '---help---': _T_HELP,
    allnoconfig_y: _T_ALLNOCONFIG_Y,
    bool: _T_BOOL,
    boolean: _T_BOOL,
    choice: _T_CHOICE,
    comment: _T_COMMENT,
    config: _T_CONFIG,
    default: _T_DEFAULT,
    defconfig_list: _T_DEFCONFIG_LIST,
    depends: _T_DEPENDS,
    endchoice: _T_ENDCHOICE,
    endif: _T_ENDIF,
    endmenu: _T_ENDMENU,
    env: _T_ENV,
    grsource: _T_ORSOURCE,
    gsource: _T_OSOURCE,
    help: _T_HELP,
    hex: _T_HEX,
    if: _T_IF,
    imply: _T_IMPLY,
    int: _T_INT,
    mainmenu: _T_MAINMENU,
    menu: _T_MENU,
    menuconfig: _T_MENUCONFIG,
    on: _T_ON,
    option: _T_OPTION,
    optional: _T_OPTIONAL,
    orsource: _T_ORSOURCE,
    osource: _T_OSOURCE,
    prompt: _T_PROMPT,
    range: _T_RANGE,
    rsource: _T_RSOURCE,
    select: _T_SELECT,
    source: _T_SOURCE,
    string: _T_STRING,
    visible: _T_VISIBLE,
  };
  return keywordMap[keyword];
};

export const MENU = _T_MENU;
export const COMMENT = _T_COMMENT;
export const AND = _T_AND;
export const OR = _T_OR;
export const NOT = _T_NOT;
export const EQUAL = _T_EQUAL;
export const UNEQUAL = _T_UNEQUAL;
export const LESS = _T_LESS;
export const LESS_EQUAL = _T_LESS_EQUAL;
export const GREATER = _T_GREATER;
export const GREATER_EQUAL = _T_GREATER_EQUAL;
export const REL_TO_STR: { [key: number]: string } = {
  [EQUAL]: '=',
  [UNEQUAL]: '!=',
  [LESS]: '<',
  [LESS_EQUAL]: '<=',
  [GREATER]: '>',
  [GREATER_EQUAL]: '>=',
};

export const UNKNOWN = 0;
export const BOOL = _T_BOOL;
export const STRING = _T_STRING;
export const TRISTATE = _T_TRISTATE;
export const INT = _T_INT;
export const HEX = _T_HEX;
export const TYPE_TO_STR: { [key: number]: string } = {
  [UNKNOWN]: 'unknown',
  [BOOL]: 'bool',
  [STRING]: 'string',
  [INT]: 'int',
  [HEX]: 'hex',
};
const _TYPE_TO_BASE: { [key: number]: number } = {
  [HEX]: 16,
  [INT]: 10,
  [STRING]: 0,
  [UNKNOWN]: 0,
};

const _STRING_LEX = [
  _T_BOOL,
  _T_CHOICE,
  _T_COMMENT,
  _T_HEX,
  _T_INT,
  _T_MAINMENU,
  _T_MENU,
  _T_ORSOURCE,
  _T_OSOURCE,
  _T_PROMPT,
  _T_RSOURCE,
  _T_SOURCE,
  _T_STRING,
];

const _TYPE_TOKENS = [_T_BOOL, _T_INT, _T_HEX, _T_STRING];

const _SOURCE_TOKENS = [_T_SOURCE, _T_RSOURCE, _T_OSOURCE, _T_ORSOURCE];

const _REL_SOURCE_TOKENS = [_T_RSOURCE, _T_ORSOURCE];

const _OBL_SOURCE_TOKENS = [_T_SOURCE, _T_RSOURCE];

const _BOOL_UNKNOWN = [BOOL, UNKNOWN];

const _INT_HEX = [INT, HEX];

const _MENU_COMMENT = [MENU, COMMENT];

const _EQUAL_UNEQUAL = [EQUAL, UNEQUAL];

const _RELATIONS = [EQUAL, UNEQUAL, LESS, LESS_EQUAL, GREATER, GREATER_EQUAL];

/**
 * Regular expression for matching the initial token on a line.
 * It trims leading and trailing whitespace and is used to jump to the next token.
 * Fails to match empty lines and comment lines. '$' is included for detecting
 * preprocessor variable assignments with macro expansions on the left-hand side.
 */
const COMMAND_MATCH_REGEX: RegExp = /^\s*([A-Za-z0-9_$-]+)\s*/u;

/**
 * Regular expression for matching an identifier/keyword after the first token.
 * It trims trailing whitespace and '$' is included to detect identifiers with
 * macro expansions.
 */
const ID_KEYWORD_MATCH_REGEX: RegExp = /^([A-Za-z0-9_$/.-]+)\s*/u;

/**
 * Regular expression for matching a fragment in the left-hand side of a
 * preprocessor variable assignment. It matches the portions between macro
 * expansions ($(foo)). Macros are supported in the LHS (variable name).
 */
const ASSIGNMENT_LHS_FRAGMENT_MATCH_REGEX: RegExp = /^[A-Za-z0-9_-]*/u;

/**
 * Regular expression for matching the assignment operator and value (right-hand side)
 * in a preprocessor variable assignment.
 */
const ASSIGNMENT_RHS_MATCH_REGEX: RegExp = /^\s*(=|:=|\+=)\s*(.*)/u;

/**
 * Regular expression for searching special characters/strings while expanding a macro.
 * It looks for '(', ')', ',', and '$('.
 */
const MACRO_SPECIAL_SEARCH_REGEX: RegExp = /\(|\)|,|\$\(/u;

/**
 * Regular expression for searching special characters/strings while expanding a string.
 * It looks for quotes, '\', and '$('.
 */
const STRING_SPECIAL_SEARCH_REGEX: RegExp = /"|'|\\|\$\(/u;

/**
 * Regular expression for searching special characters/strings while expanding a symbol name.
 * It also includes end-of-line in case the macro is the last thing on the line.
 */
const NAME_SPECIAL_SEARCH_REGEX: RegExp = /[^A-Za-z0-9_$/.-]|\$\(|$/u;

/**
 * Regular expression for matching a valid right-hand side for an assignment to a
 * string symbol in a.config file, including escaped characters. Extracts the contents.
 */
const CONF_STRING_MATCH_REGEX: RegExp = /^"((?:[^\\"]|\\.)*)"/u;

/**
 * Matches the initial token on a line.
 * @param input - The input string to be matched.
 * @returns The match result as an array if matched, or null if not.
 */
function _command_match(input: string): RegExpMatchArray | null {
  return input.match(COMMAND_MATCH_REGEX);
}

/**
 * Matches an identifier/keyword after the first token.
 * @param input - The input string to be matched.
 * @param pos - The position in the input string to start matching.
 * @returns The match result as an array if matched, or null if not.
 */
function _id_keyword_match(input: string, pos: number): RegExpMatchArray | null {
  const match = input.substring(pos).match(ID_KEYWORD_MATCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Matches a fragment in the left-hand side of a preprocessor variable assignment.
 * @param input - The input string to be matched.
 * @param pos - The position in the input string to start matching. Default is 0.
 * @returns The match result as an array if matched, or null if not.
 */
function _assignment_lhs_fragment_match(input: string, pos = 0): RegExpMatchArray | null {
  const match = input.substring(pos).match(ASSIGNMENT_LHS_FRAGMENT_MATCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Matches the assignment operator and value (right-hand side) in a preprocessor
 * variable assignment.
 * @param input - The input string to be matched.
 * @param pos - The position in the input string to start matching. Default is 0.
 * @returns The match result as an array if matched, or null if not.
 */
function _assignment_rhs_match(input: string, pos = 0): RegExpMatchArray | null {
  const match = input.substring(pos).match(ASSIGNMENT_RHS_MATCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Searches for special characters/strings while expanding a macro.
 * @param input - The input string to be searched.
 * @param pos - The position in the input string to start searching. Default is 0.
 * @returns The match result as an array if found, or null if not.
 */
function _macro_special_search(input: string, pos = 0): RegExpMatchArray | null {
  const match = input.substring(pos).match(MACRO_SPECIAL_SEARCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Searches for special characters/strings while expanding a string.
 * @param input - The input string to be searched.
 * @param pos - The position in the input string to start searching. Default is 0.
 * @returns The match result as an array if found, or null if not.
 */
function _string_special_search(input: string, pos = 0): RegExpMatchArray | null {
  const match = input.substring(pos).match(STRING_SPECIAL_SEARCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Searches for special characters/strings while expanding a symbol name.
 * @param input - The input string to be searched.
 * @param pos - The position in the input string to start searching. Default is 0.
 * @returns The match result as an array if found, or null if not.
 */
function _name_special_search(input: string, pos = 0): RegExpMatchArray | null {
  const match = input.substring(pos).match(NAME_SPECIAL_SEARCH_REGEX);
  if (match && match.index !== undefined) {
    match.index += pos;
  }
  return match;
}

/**
 * Matches a valid right-hand side for an assignment to a string symbol in a.config file,
 * including escaped characters. Extracts the contents.
 * @param input - The input string to be matched.
 * @returns The match result as an array if matched, or null if not.
 */
function _conf_string_match(input: string): RegExpMatchArray | null {
  return input.match(CONF_STRING_MATCH_REGEX);
}

/**
 * Checks if an item is a Sym or Choice.
 * @param item - The item to check.
 * @returns True if the item is a Sym or Choice, false otherwise.
 */
export function isSymbolOrChoice(item: unknown): boolean {
  return item instanceof Sym || item instanceof Choice;
}

/**
 * expr_str() helper. Adds parentheses around expressions of type 'type_'.
 *
 * @param expr - The expression to process.
 * @param type_ - The type of expression to add parentheses around.
 * @param sc_expr_str_fn - The function to get the string representation of symbols/choices in the expression.
 * @returns The processed expression string with parentheses if applicable.
 */
function _parenthesize(expr: any, type_: number, sc_expr_str_fn: (arg: any) => string): string {
  if (Array.isArray(expr) && expr[0] === type_) {
    return `(${expr_str(expr, sc_expr_str_fn)})`;
  }
  return expr_str(expr, sc_expr_str_fn);
}

/**
 * Symbols and Choices have a "visibility" that acts as an upper bound on
 * the values a user can set for them, corresponding to the visibility in
 * e.g. 'make menuconfig'. This function calculates the visibility for the
 * Sym or Choice 'sc' -- the logic is nearly identical.
 *
 * @param sc - The Sym or Choice to calculate the visibility for.
 * @returns The visibility value (0 or other appropriate value).
 */
function _visibility(sc: Sym | Choice): number {
  let vis = 0;
  for (const node of sc.nodes) {
    if (node.prompt) {
      vis = Math.max(vis, expr_value(node.prompt[1]));
    }
  }
  return vis;
}

/**
 * Adds 'sc' (symbol or choice) as a "dependee" to all symbols in 'expr'.
 * Constant symbols in 'expr' are skipped as they can never change value
 * anyway.
 *
 * @param sc - The symbol or choice to add as a dependee.
 * @param expr - The expression containing symbols to add the dependee to.
 */
function _depend_on(sc: Sym | Choice, expr: any): void {
  if (Array.isArray(expr)) {
    _depend_on(sc, expr[1]);
    if (expr[0] !== NOT) {
      _depend_on(sc, expr[2]);
    }
  } else if (!expr.is_constant) {
    expr._dependents.add(sc);
  }
}

/**
 * Returns 'lst' with any duplicates removed, preserving order. This hacky
 * version seems to be a common idiom. It relies on short-circuit evaluation
 * and set.add() returning {@code null}, which is falsy.
 *
 * @param lst - The list to remove duplicates from.
 * @returns The list with duplicates removed while preserving order.
 */
function _ordered_unique<T extends Sym | Choice>(lst: T[]): T[] {
  const seen: Set<T> = new Set();
  for (const item of lst) {
    if (!seen.has(item)) {
      seen.add(item);
    }
  }
  return [...seen];
}

/**
 * Checks if the given string 's' can be parsed as an integer in base 'n'.
 *
 * @param s - The string to check.
 * @param n - The base to check the string against.
 * @returns {@code true} if the string can be parsed as an integer in the given base, {@code false} otherwise.
 */
function _is_base_n(s: string, n: number): boolean {
  try {
    const value = parseInt(s, n);
    return !isNaN(value);
  } catch {
    return false;
  }
}

/**
 * strcmp()-alike that returns -1, 0, or 1.
 *
 * @param s1 - The first string to compare.
 * @param s2 - The second string to compare.
 * @returns -1, 0, or 1 depending on the comparison result.
 */
function _strcmp(s1: string, s2: string): number {
  if (s1 < s2) {
    return -1;
  } else if (s1 > s2) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * expr_value() helper for converting a symbol to a number. Raises
 * ValueError for symbols that can't be converted.
 *
 * For BOOL n/y count as 0/2.
 *
 * @param sym - The symbol to convert to a number.
 * @returns The converted number value.
 */
function _sym_to_num(sym: Sym | Choice): number {
  return sym.orig_type === BOOL ? sym.bool_value : parseInt(sym.str_value, _TYPE_TO_BASE[sym.orig_type]);
}

/**
 * See write_config().
 *
 * @param path - The path of the file to perform the operation on.
 */
function _save_old(path: string): void {
  try {
    copyFileSync(path, path + '.old');
  } catch {}
}

/**
 * Sym/Choice.name_and_loc helper. Returns the "(defined at...)" part of
 * the string. 'sc' is a Sym or Choice.
 *
 * @param sc - The Sym or Choice to get the location information for.
 * @returns The location string in the format "(defined at...)".
 */
function _locs(sc: Sym | Choice): string {
  if (sc.nodes.length > 0) {
    return `(defined at ${sc.nodes.map((node) => `${node.filename}:${node.linenr}`).join(', ')})`;
  }
  return '(undefined)';
}

/**
 * Reimplementation of expr_depends_symbol() from mconf.c. Used to determine
 * if a submenu should be implicitly created. This also influences which
 * items inside choice statements are considered choice items.
 *
 * @param expr - The expression to check.
 * @param sym - The symbol to check the dependency against.
 * @returns {@code true} if the expression depends on the symbol, {@code false} otherwise.
 */
function _expr_depends_on(expr: any, sym: Sym): boolean {
  if (!Array.isArray(expr)) {
    return expr === sym;
  }

  if (_EQUAL_UNEQUAL.includes(expr[0])) {
    let [, left, right] = expr;
    if (right === sym) {
      [left, right] = [right, left];
    } else if (left !== sym) {
      return false;
    }
    return (expr[0] === EQUAL && right === sym.kconfig.y) || (expr[0] === UNEQUAL && right === sym.kconfig.n);
  }

  return expr[0] === AND && (_expr_depends_on(expr[1], sym) || _expr_depends_on(expr[2], sym));
}

/**
 * Returns True if node2 has an "automatic menu dependency" on node1. If
 * node2 has a prompt, we check its condition. Otherwise, we look directly
 * at node2.dep.
 *
 * @param node1 - The first node.
 * @param node2 - The second node.
 * @returns {@code true} if node2 has an automatic menu dependency on node1, {@code false} otherwise.
 */
function _auto_menu_dep(node1: any, node2: any): boolean {
  return _expr_depends_on(node2.prompt ? node2.prompt[1] : node2.dep, node1.item);
}

/**
 * "Flattens" menu nodes without prompts (e.g. 'if' nodes and non-visible
 * symbols with children from automatic menu creation) so that their
 * children appear after them instead. This gives a clean menu structure
 * with no unexpected "jumps" in the indentation.
 *
 * Do not flatten promptless choices (which can appear "legitimately" if a
 * named choice is defined in multiple locations to add on symbols). It
 * looks confusing, and the menuconfig already shows all choice symbols if
 * you enter the choice at some location with a prompt.
 *
 * @param node - The menu node to start flattening from.
 */
function _flatten(node: MenuNode | null): void {
  while (node) {
    if (node.list && !node.prompt && !(node.item instanceof Choice)) {
      let lastNode = node.list;
      while (lastNode) {
        lastNode.parent = node.parent;
        if (!lastNode.next) {
          break;
        }
        lastNode = lastNode.next;
      }
      lastNode.next = node.next;
      node.next = node.list;
      node.list = null;
    }
    node = node.next;
  }
}

/**
 * Removes 'if' nodes (which can be recognized by MenuNode.item being null),
 * which are assumed to already have been flattened. The C implementation
 * doesn't bother to do this, but we expose the menu tree directly, and it
 * makes it nicer to work with.
 *
 * @param node - The node from which to start removing 'if' nodes.
 */
function _remove_ifs(node: MenuNode): void {
  let cur = node.list;
  while (cur && !cur.item) {
    cur = cur.next;
  }
  node.list = cur;

  while (cur) {
    let next = cur.next;
    while (next && !next.item) {
      next = next.next;
    }
    cur.next = next;
    cur = next;
  }
}

/**
 * Finalizes a choice, marking each symbol whose menu node has the choice as
 * the parent as a choice symbol, and automatically determining types if not
 * specified.
 *
 * @param node - The node representing the choice to finalize.
 */
function _finalize_choice(node: any): void {
  const choice = node.item as Choice;
  let cur = node.list;
  while (cur) {
    if (cur.item instanceof Sym) {
      cur.item.choice = choice;
      choice.syms.push(cur.item);
    }
    cur = cur.next;
  }

  // If no type is specified for the choice, its type is that of
  // the first choice item with a specified type
  if (!choice.orig_type) {
    for (const item of choice.syms) {
      if (item.orig_type) {
        choice.orig_type = item.orig_type;
        break;
      }
    }
  }

  // Each choice item of UNKNOWN type gets the type of the choice
  for (const sym of choice.syms) {
    if (!sym.orig_type) {
      sym.orig_type = choice.orig_type;
    }
  }
}

/**
 * Detects dependency loops using depth-first search on the dependency graph
 * (which is calculated earlier in Kconfig._build_dep()).
 *
 * Algorithm:
 *
 *  1. Symbols/choices start out with _visited = 0, meaning unvisited.
 *
 *  2. When a symbol/choice is first visited, _visited is set to 1, meaning
 *     "visited, potentially part of a dependency loop". The recursive
 *     search then continues from the symbol/choice.
 *
 *  3. If we run into a symbol/choice X with _visited already set to 1,
 *     there's a dependency loop. The loop is found on the call stack by
 *     recording symbols while returning ("on the way back") until X is seen
 *     again.
 *
 *  4. Once a symbol/choice and all its dependencies (or dependents in this
 *     case) have been checked recursively without detecting any loops, its
 *     _visited is set to 2, meaning "visited, not part of a dependency
 *     loop".
 *
 *     This saves work if we run into the symbol/choice again in later calls
 *     to _check_dep_loop_sym(). We just return immediately.
 *
 * Choices complicate things, as every choice symbol depends on every other
 * choice symbol in a sense. When a choice is "entered" via a choice symbol
 * X, we visit all choice symbols from the choice except X, and prevent
 * immediately revisiting the choice with a flag (ignore_choice).
 *
 * Maybe there's a better way to handle this (different flags or the
 * like...).
 *
 * @param sym - The symbol to check for dependency loops.
 * @param ignore_choice - Flag to indicate whether to ignore the choice in certain cases.
 * @returns An array representing the dependency loop if found, or null if no loop is found.
 */
function _check_dep_loop_sym(sym: Sym, ignore_choice: boolean): Array<Sym | Choice> | null {
  if (!sym._visited) {
    // sym._visited == 0, unvisited
    sym._visited = 1;

    for (const dep of sym._dependents) {
      // Choices show up in Sym._dependents when the choice has the
      // symbol in a 'prompt' or 'default' condition (e.g.
      // 'default... if SYM').
      //
      // Since we aren't entering the choice via a choice symbol, all
      // choice symbols need to be checked, hence the null.
      let loop: Array<Sym | Choice> | null = null;
      if (dep instanceof Choice) {
        loop = _check_dep_loop_choice(dep, null);
      } else {
        loop = _check_dep_loop_sym(dep, false);
      }

      if (loop) {
        // Dependency loop found
        return _found_dep_loop(loop, sym);
      }
    }

    if (sym.choice && !ignore_choice) {
      const loop = _check_dep_loop_choice(sym.choice, sym);
      if (loop) {
        // Dependency loop found
        return _found_dep_loop(loop, sym);
      }
    }

    // The symbol is not part of a dependency loop
    sym._visited = 2;

    // No dependency loop found
    return null;
  }

  if (sym._visited === 2) {
    // The symbol was checked earlier and is already known to not be part of
    // a dependency loop
    return null;
  }

  // sym._visited == 1, found a dependency loop. Return the symbol as the
  // first element in it.
  return [sym];
}

/**
 * Detects dependency loops for a choice using depth-first search.
 *
 * @param choice - The choice to check for dependency loops.
 * @param skip - The symbol to skip during the loop detection (used to avoid false positives).
 * @returns An array representing the dependency loop if found, or null if no loop is found.
 */
function _check_dep_loop_choice(choice: Choice, skip: Sym | null): (Sym | Choice)[] | null {
  if (!choice._visited) {
    // choice._visited == 0, unvisited
    choice._visited = 1;

    // Check for loops involving choice symbols. If we came here via a
    // choice symbol, skip that one, as we'd get a false positive
    // '<sym FOO> -> <choice> -> <sym FOO>' loop otherwise.
    for (const sym of choice.syms) {
      if (sym !== skip) {
        // Prevent the choice from being immediately re-entered via the
        // "is a choice symbol" path by passing true
        const loop = _check_dep_loop_sym(sym, true);
        if (loop) {
          // Dependency loop found
          return _found_dep_loop(loop, choice);
        }
      }
    }

    // The choice is not part of a dependency loop
    choice._visited = 2;

    // No dependency loop found
    return null;
  }

  if (choice._visited === 2) {
    // The choice was checked earlier and is already known to not be part of
    // a dependency loop
    return null;
  }

  // choice._visited == 1, found a dependency loop. Return the choice as the
  // first element in it.
  return [choice];
}

/**
 * Called "on the way back" when we know we have a loop.
 *
 * @param loop - The loop that has been detected (an array of symbols/choices).
 * @param cur - The current symbol/choice being processed.
 * @returns An updated loop array if the current symbol/choice is part of the loop but not the start,
 *          or throws an exception if the current symbol/choice is the start of the loop,
 *          showing detailed loop information.
 */
function _found_dep_loop(loop: (Sym | Choice)[], cur: Sym | Choice): never | (Sym | Choice)[] {
  // Is the symbol/choice 'cur' where the loop started?
  if (cur !== loop[0]) {
    // Nope, it's just a part of the loop
    return loop.concat(cur);
  }

  // Yep, we have the entire loop. Throw an exception that shows it.
  let msg = '\nDependency loop\n===============\n\n';

  for (const item of loop) {
    if (item !== loop[0]) {
      msg += '...depends on ';
      if (item instanceof Sym && item.choice) {
        msg += 'the choice symbol ';
      }
      msg += `${item.name_and_loc}, with definition...\n\n${item}\n\n`;

      // Small wart: Since we reuse the already calculated
      // Sym/Choice._dependents sets for recursive dependency detection, we
      // lose information on whether a dependency came from a 'select'/'imply'
      // condition or e.g. a 'depends on'.
      //
      // This might cause selecting symbols to "disappear". For example,
      // a symbol B having 'select A if C' gives a direct dependency from A to
      // C, since it corresponds to a reverse dependency of B && C.
      //
      // Always print reverse dependencies for symbols that have them to make
      // sure information isn't lost. I wonder if there's some neat way to
      // improve this.

      if (item instanceof Sym) {
        if (item.rev_dep !== item.kconfig.n) {
          msg += `(select-related dependencies: ${expr_str(item.rev_dep)})\n\n`;
        }
        if (item.weak_rev_dep !== item.kconfig.n) {
          msg += `(imply-related dependencies: ${expr_str(item.rev_dep)})\n\n`;
        }
      }
    }
  }

  msg += '...depends again on ' + loop[0].name_and_loc;

  throw new KconfigError(msg);
}

/**
 * Writes a deprecation warning to stderr regarding the 'verbose' argument of a function.
 *
 * @param fn_name - The name of the function whose 'verbose' argument is deprecated.
 */
function _warn_verbose_deprecated(fn_name: string): void {
  process.stderr.write(
    `Deprecation warning: ${fn_name}()'s 'verbose' argument has no effect. Since ` +
      `Kconfiglib 12.0.0, the message is returned from ${fn_name}() instead, ` +
      `and is always generated. Do e.g. print(kconf.${fn_name}()) if you want to ` +
      `want to show a message like "Loaded configuration '.config'" on ` +
      `stdout. The old API required ugly hacks to reuse messages in ` +
      `configuration interfaces.\n`,
  );
}

//
// Predefined preprocessor functions
//

/**
 * Returns the filename of the given Kconfig instance.
 *
 * @param kconf - The Kconfig instance.
 * @returns The filename.
 */
function _filename_fn(kconf: any): string {
  return kconf.filename;
}

/**
 * Returns the line number of the given Kconfig instance as a string.
 *
 * @param kconf - The Kconfig instance.
 * @returns The line number as a string.
 */
function _lineno_fn(kconf: any): string {
  return `${kconf.linenr}`;
}

/**
 * Prints an info message with the filename and line number of the given Kconfig instance.
 *
 * @param kconf - The Kconfig instance.
 * @param msg - The message to print.
 * @returns An empty string.
 */
function _info_fn(kconf: any, msg: string): string {
  logger.info(`${kconf.filename}:${kconf.linenr}: ${msg}`);
  return '';
}

/**
 * Writes a warning message to the Kconfig instance's warning mechanism if the condition is 'y'.
 *
 * @param kconf - The Kconfig instance.
 * @param cond - The condition to check.
 * @param msg - The warning message to write.
 * @returns An empty string.
 */
function _warning_if_fn(kconf: any, cond: string, msg: string): string {
  if (cond === 'y') {
    kconf._warn(msg, kconf.filename, kconf.linenr);
  }
  return '';
}

/**
 * Throws a KconfigError if the condition is 'y'.
 *
 * @param kconf - The Kconfig instance.
 * @param cond - The condition to check.
 * @param msg - The error message to throw.
 * @returns An empty string.
 */
function _error_if_fn(kconf: any, cond: string, msg: string): string {
  if (cond === 'y') {
    throw new KconfigError(`${kconf.filename}:${kconf.linenr}: ${msg}`);
  }
  return '';
}

/**
 * Executes a shell command and returns its output, handling decoding errors and stderr messages.
 *
 * @param kconf - The Kconfig instance.
 * @param command - The shell command to execute.
 * @returns The output of the shell command with newline processing.
 */
function _shell_fn(kconf: any, command: string): string {
  const result = spawnSync(command, { shell: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

  if (result.stderr) {
    kconf._warn(`'${command}' wrote to stderr: ${result.stderr.split('\n').join(' ')}`, kconf.filename, kconf.linenr);
  }

  return result.stdout.trim().replace(/\n/g, ' ');
}

function isSpace(str: string): boolean {
  return /^[\s]+$/.test(str);
}

function hex(n: number) {
  return '0x' + n.toString(16);
}

//
// Public functions
//

/**
 * Expands environment variables or specific placeholders within a string.
 * This function can be extended to replace other placeholders as needed.
 *
 * @param s - The input string with placeholders to be expanded.
 * @returns The expanded string with placeholders replaced by their values.
 */
export function expandvars(path: string): string {
  // If no '$' is present in the path, return it as is.
  if (!path.includes('$')) {
    return path;
  }

  // Regular expression to match variables of the form $var or ${var}
  const varRegex = /\$(\w+|\{[^}]*\})/g;

  let result = path;

  // Loop through the matches and replace them with the corresponding environment variable values
  result = result.replace(varRegex, (match, name) => {
    // Remove {} around the variable name if present
    if (name.startsWith('{') && name.endsWith('}')) {
      name = name.slice(1, -1);
    }

    // Get the environment variable value from process.env
    const value = process.env[name];

    // If the environment variable exists, replace it, else keep the original match
    if (value !== undefined) {
      return value;
    } else {
      return match;
    }
  });

  return result;
}

/**
 * Evaluates the expression 'expr' to a bool value. Returns 0 (n), or 2 (y).
 *
 * 'expr' must be an already-parsed expression from a Sym, Choice, or
 * MenuNode property. To evaluate an expression represented as a string, use
 * Kconfig.eval_string().
 *
 * Passing subexpressions of expressions to this function works as expected.
 */
export function expr_value(expr: Sym | Choice | TKconfigExpr): number {
  if (!(expr instanceof Array)) {
    return expr.bool_value;
  }

  if (expr[0] === AND) {
    const val_left_side = expr_value(expr[1]); // expr = (AND, left, right)
    // Short-circuit the n case as an optimization (~5% faster
    // allnoconfig.py and allyesconfig.py, as of writing)
    return val_left_side === 0 ? 0 : Math.min(val_left_side, expr_value(expr[2]));
  }

  if (expr[0] === OR) {
    const val_left_side = expr_value(expr[1]); // expr = (OR, left, right)
    // Short-circuit the y case as an optimization
    return val_left_side === 2 ? 2 : Math.max(val_left_side, expr_value(expr[2]));
  }

  if (expr[0] === NOT) {
    return 2 - expr_value(expr[1]);
  }

  // Relation
  //
  // Implements <, <=, >, >= comparisons as well. These were added to
  // kconfig in 31847b67 (kconfig: allow use of relations other than
  // (in)equality).
  const [rel, v1, v2] = expr as [number, Sym | Choice, Sym | Choice];
  let comp: number;
  // If both operands are strings...
  if (v1.orig_type === STRING && v2.orig_type === STRING) {
    //...then compare them lexicographically
    comp = _strcmp(v1.str_value, v2.str_value);
  } else {
    // Otherwise, try to compare them as numbers
    try {
      comp = _sym_to_num(v1) - _sym_to_num(v2);
    } catch {
      // Fall back on a lexicographic comparison if the operands don't
      // parse as numbers
      comp = _strcmp(v1.str_value, v2.str_value);
    }
  }

  const condition =
    rel === EQUAL
      ? comp === 0
      : rel === UNEQUAL
        ? comp !== 0
        : rel === LESS
          ? comp < 0
          : rel === LESS_EQUAL
            ? comp <= 0
            : rel === GREATER
              ? comp > 0
              : rel === GREATER_EQUAL
                ? comp >= 0
                : false;
  return condition ? 2 : 0;
}

/**
 * Standard symbol/choice printing function. Uses plain Kconfig syntax, and
 * displays choices as <choice> (or <choice NAME>, for named choices).
 *
 * See {@link expr_str}.
 */
export function standard_sc_expr_str(sc: Sym | Choice): string {
  if (sc instanceof Sym) {
    if (sc.is_constant && !(sc.name in STR_TO_BOOL)) {
      return `"${escape(sc.name)}"`;
    }
    return sc.name;
  }
  return sc.name ? `<choice ${sc.name}>` : '<choice>';
}

/**
 * Returns the string representation of the expression 'expr', as in a Kconfig
 * file.
 *
 * Passing subexpressions of expressions to this function works as expected.
 *
 * @param expr - The expression to convert to a string.
 * @param sc_expr_str_fn - The function to get the string representation of
 * symbols/choices in the expression (default: {@link standard_sc_expr_str}).
 * @returns The string representation of the given expression.
 */
export function expr_str(expr: any, sc_expr_str_fn: (arg: any) => string = standard_sc_expr_str): string {
  if (!Array.isArray(expr)) {
    return sc_expr_str_fn(expr);
  }

  if (expr[0] === AND) {
    return `${_parenthesize(expr[1], OR, sc_expr_str_fn)} && ${_parenthesize(expr[2], OR, sc_expr_str_fn)}`;
  }

  if (expr[0] === OR) {
    // This turns A && B || C && D into "(A && B) || (C && D)", which is
    // redundant, but more readable
    return `${_parenthesize(expr[1], AND, sc_expr_str_fn)} || ${_parenthesize(expr[2], AND, sc_expr_str_fn)}`;
  }

  if (expr[0] === NOT) {
    if (Array.isArray(expr[1])) {
      return `!(${expr_str(expr[1], sc_expr_str_fn)})`;
    }
    return `!${sc_expr_str_fn(expr[1])}`;
  }

  // Relation
  //
  // Relation operands are always symbols (quoted strings are constant
  // symbols)
  return `${sc_expr_str_fn(expr[1])} ${REL_TO_STR[expr[0]]} ${sc_expr_str_fn(expr[2])}`;
}

/**
 * Returns a set() of all items (symbols and choices) that appear in the
 * expression 'expr'.
 *
 * Passing subexpressions of expressions to this function works as expected.
 *
 * @param expr - The expression to extract items from.
 * @returns A set containing all the symbols and choices in the expression.
 */
export function expr_items(expr: TKconfigExpr): Set<Sym | Choice> {
  const res: Set<Sym | Choice> = new Set();

  function rec(subexpr: any): void {
    if (Array.isArray(subexpr)) {
      rec(subexpr[1]);
      if (subexpr[0] !== NOT) {
        rec(subexpr[2]);
      }
    } else {
      res.add(subexpr);
    }
  }

  rec(expr);
  return res;
}

/**
 * Returns a list containing the top-level AND or OR operands in the
 * expression 'expr', in the same (left-to-right) order as they appear in
 * the expression.
 *
 * This can be handy e.g. for splitting (weak) reverse dependencies
 * from 'select' and 'imply' into individual selects/implies.
 *
 * @param expr - The expression to split.
 * @param op - The operation type (either {@link AND} or {@link OR}) to split the expression by.
 * @returns A list of the top-level operands based on the specified operation.
 */
export function split_expr(expr: any, op: typeof AND | typeof OR): any[] {
  const res: any[] = [];

  function rec(subexpr: any): void {
    if (Array.isArray(subexpr) && subexpr[0] === op) {
      rec(subexpr[1]);
      rec(subexpr[2]);
    } else {
      res.push(subexpr);
    }
  }

  rec(expr);
  return res;
}

/**
 * Escapes the string 's' in the same fashion as is done for display in
 * Kconfig format and when writing strings to a.config file. " and \ are
 * replaced by \" and \\, respectively.
 *
 * @param s - The string to escape.
 * @returns The escaped string.
 */
export function escape(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * Unescapes the string 's'. \ followed by any character is replaced with just
 * that character. Used internally when reading.config files.
 *
 * @param s - The string to unescape.
 * @returns The unescaped string.
 */
export function unescape(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

/**
 * Argument parsing helper for tools that take a single optional Kconfig file
 * argument (default: Kconfig). Returns the Kconfig instance for the parsed
 * configuration.
 *
 * Exits with process.exit(1) on errors.
 *
 * @returns The Kconfig instance for the parsed configuration.
 */
export function standard_kconfig(): any {
  const kconfig = process.argv[2];
  let parserVersion: number;
  try {
    parserVersion = parseInt(process.env.KCONFIG_PARSER_VERSION || '1');
    return new Kconfig({ filename: kconfig ?? 'Kconfig', parser_version: parserVersion });
  } catch {
    process.exit(1);
  }
}

/**
 * Helper for tools. Returns the value of KCONFIG_CONFIG (which specifies the
 *.config file to load/save) if it is set, and ".config" otherwise.
 *
 * Calling load_config() with filename={@code null} might give the behavior you want,
 * without having to use this function.
 *
 * @returns The filename for the configuration file.
 */
export function standard_config_filename(): string {
  return process.env.KCONFIG_CONFIG || '.config';
}

export class Kconfig {
  /**
   * Represents a Kconfig configuration, e.g. for x86 or ARM. This is the set of
   * symbols, choices, and menu nodes appearing in the configuration. Creating
   * any number of Kconfig objects (including for different architectures) is
   * safe. Kconfiglib doesn't keep any global state.
   *
   * The following attributes are available. They should be treated as
   * read-only, and some are implemented through @property magic.
   */
  readonly _encoding: BufferEncoding;

  /**
   * Predefined preprocessor functions, with min/max number of arguments
   */
  _functions: Record<string, any>;

  /**
   * Regular expressions for parsing .config files. Matches strings like `CONFIG_FOO=BAR` of a line.
   */
  _set_match: (string: string) => RegExpMatchArray | null;

  /**
   * Regular expressions for parsing .config files. Matches strings like `# CONFIG_FOO is not set` of a line.
   */
  _unset_match: (string: string) => RegExpMatchArray | null;

  /*
   * A prefix we can reliably strip from glob() results to get a filename
   * relative to $srctree. relpath() can cause issues for symlinks,
   * because it assumes symlink/../foo is the same as foo/.
   */
  _srctree_prefix: string;

  /**
   * This determines whether previously unseen symbols are registered.
   * They shouldn't be if we parse expressions after parsing, as part of
   * Kconfig.eval_string().
   */
  _parsing_kconfigs: boolean;

  /**
   * Used to avoid retokenizing lines when we discover
   * part of the construct currently being parsed. This is kinda like an
   * unget operation.
   */
  _reuse_tokens: boolean;

  /**
   * A tuple of (filename, linenr) tuples, giving the locations of the
   * 'source' statements via which the Kconfig file containing this menu node
   * was included.
   */
  _include_path: Array<[string, number]>;

  /**
   * Keeps track of the location in the parent Kconfig files. Kconfig
   * files usually source other Kconfig files. See {@link _enter_file()}.
   */
  _filestack: Array<[Array<[string, number]>, () => string]>;

  _warn_assign_no_prompt: boolean;
  _readline: () => string;
  _line: any;
  _tokens: any;
  _tokens_i: any;

  /**
   * The value the KCONFIG_CONFIG_HEADER environment variable had when the
   * Kconfig instance was created, or the empty string if
   * KCONFIG_CONFIG_HEADER wasn't set. This string is inserted verbatim at the
   * beginning of configuration files. See write_config().
   */
  config_header: string;

  /**
   * The value the CONFIG_ environment variable had when the Kconfig instance
   * was created, or "CONFIG_" if CONFIG_ wasn't set. This is the prefix used
   * (and expected) on symbol names in.config files and C headers. Used in
   * the same way in the C tools.
   */
  config_prefix: string;

  /**
   * The Sym instance for the 'option defconfig_list' symbol, or None if no
   * defconfig_list symbol exists. The defconfig filename derived from this
   * symbol can be found in Kconfig.defconfig_filename.
   */
  defconfig_list: Sym | null;

  /**
   * The value the KCONFIG_AUTOHEADER_HEADER environment variable had when the
   * Kconfig instance was created, or the empty string if
   * KCONFIG_AUTOHEADER_HEADER wasn't set. This string is inserted verbatim at
   * the beginning of header files. See write_autoconf().
   */
  header_header: string;

  /**
   * Not used internally. Provided as a convenience.
   * TODO is the attribute below needed?
   *
   * A list with the filenames of all Kconfig files included in the
   * configuration, relative to $srctree (or relative to the current directory
   * if $srctree isn't set), except absolute paths (e.g.
   *'source "/foo/Kconfig"') are kept as-is.
   *
   * The files are listed in the order they are source'd, starting with the
   * top-level Kconfig file. If a file is source'd multiple times, it will
   * appear multiple times. Use set() to get unique filenames.
   *
   * Note that Kconfig.sync_deps() already indirectly catches any file
   * modifications that change configuration output.
   */
  kconfig_filenames: string[];

  readonly y: Sym;

  readonly n: Sym;

  /**
   * The value the $srctree environment variable had when the Kconfig instance
   * was created, or the empty string if $srctree wasn't set. This gives nice
   * behavior with os.path.join(), which treats "" as the current directory,
   * without adding "./".
   *
   * Kconfig files are looked up relative to $srctree (unless absolute paths
   * are used), and.config files are looked up relative to $srctree if they
   * are not found in the current directory. This is used to support
   * out-of-tree builds. The C tools use this environment variable in the same
   * way.
   *
   * Changing $srctree after creating the Kconfig instance has no effect. Only
   * the value when the configuration is loaded matters. This avoids surprises
   * if multiple configurations are loaded with different values for $srctree.
   */
  srctree: string;

  /**
   * The menu node (see the MenuNode class) of the implicit top-level menu.
   * Acts as the root of the menu tree.
   */
  top_node: MenuNode;

  /**
   * Same as 'warn', but for informational messages.
   */
  info: boolean;

  /**
   * Set this variable to True/False to enable/disable warnings.
   *
   * When 'warn' is False, the values of the other warning-related variables
   * are ignored.
   *
   * This variable as well as the other warn* variables can be read to check
   * the current warning settings.
   */
  warn: boolean;

  /**
   * Set this variable to True to generate warnings for multiple assignments
   * to the same symbol in configuration files, where the assignments set
   * different values (e.g. CONFIG_FOO=n followed by CONFIG_FOO=y, where the
   * last value would get used).
   *
   * This variable is True by default. Disabling it might be useful when
   * merging configurations.
   */
  warn_assign_override: boolean;

  /**
   * Like warn_assign_override, but for multiple assignments setting a symbol
   * to the same value.
   *
   * This variable is True by default. Disabling it might be useful when
   * merging configurations.
   */
  warn_assign_redun: boolean;

  /**
   * Set this variable to True to generate warnings for assignments to
   * undefined symbols in configuration files.
   *
   * This variable is False by default unless the KCONFIG_WARN_UNDEF_ASSIGN
   * environment variable was set to 'y' when the Kconfig instance was
   * created.
   */
  warn_assign_undef: boolean;

  /**
   * Set this variable to True/False to enable/disable warnings on stderr.
   */
  warn_to_stderr: boolean;

  /**
   * The current parsing location, for use in Python preprocessor functions.
   * See the module docstring.
   * TODO May be removed during removing preprocessor functions
   */
  filename: string;

  /**
   * A list of strings containing all warnings that have been generated, for
   * cases where more flexibility is needed.
   *
   * See the 'warn_to_stderr' parameter to Kconfig.__init__() and the
   * Kconfig.warn_to_stderr variable as well. Note that warnings still get
   * added to Kconfig.warnings when 'warn_to_stderr' is True.
   *
   * Just as for warnings printed to stderr, only warnings that are enabled
   * will get added to Kconfig.warnings. See the various Kconfig.warn*
   * variables.
   */
  warnings: string[];

  /**
   * A dictionary with all symbols in the configuration, indexed by name. Also
   * includes all symbols that are referenced in expressions but never
   * defined, except for constant (quoted) symbols.
   *
   * Undefined symbols can be recognized by Sym.nodes being empty -- see
   * the 'Intro to the menu tree' section in the module docstring.
   */
  syms: Record<string, Sym>;

  /**
   * A dictionary like 'syms' for constant (quoted) symbols
   */
  const_syms: Record<string, Sym>;

  /**
   * A list with all defined symbols, in the same order as they appear in the
   * Kconfig files. Symbols defined in multiple locations appear multiple
   * times.
   *
   * @note You probably want to use 'unique_defined_syms' instead. This
   * attribute is mostly maintained for backwards compatibility.
   */
  defined_syms: Sym[];

  /**
   * A list with (name, value) tuples for all assignments to undefined symbols
   * within the most recently loaded.config file(s). 'name' is the symbol
   * name without the 'CONFIG_' prefix. 'value' is a string that gives the
   * right-hand side of the assignment verbatim.
   *
   * See Kconfig.load_config() as well.
   */
  missing_syms: Array<[string, string]>;

  /**
   * A dictionary like 'syms' for named choices (choice FOO).
   */
  named_choices: Record<string, Choice>;

  /**
   * A list with all choices, in the same order as they appear in the Kconfig
   * files.
   *
   * @note You probably want to use 'unique_choices' instead. This attribute
   * is mostly maintained for backwards compatibility.
   */
  choices: Choice[];

  /**
   * A list with all menus, in the same order as they appear in the Kconfig
   * files.
   */
  menus: MenuNode[];

  /**
   * A list with all comments, in the same order as they appear in the Kconfig
   * files.
   */
  comments: MenuNode[];

  /**
   * A dictionary with all preprocessor variables, indexed by name. See the
   * Variable class.
   */
  variables: Record<string, Variable>;

  /**
   * A set() with the names of all environment variables referenced in the
   * Kconfig files.
   *
   * Only environment variables referenced with the preprocessor $(FOO) syntax
   * will be registered. The older $FOO syntax is only supported for backwards
   * compatibility.
   *
   * Also note that $(FOO) won't be registered unless the environment variable
   * $FOO is actually set. If it isn't, $(FOO) is an expansion of an unset
   * preprocessor variable (which gives the empty string).
   *
   * Another gotcha is that environment variables referenced in the values of
   * recursively expanded preprocessor variables (those defined with =) will
   * only be registered if the variable is actually used (expanded) somewhere.
   *
   * The note from the 'kconfig_filenames' documentation applies here too.
   */
  env_vars: Set<string>;

  /**
   * The version of the parser used to parse the Kconfig files. Defaults to 1.
   */
  parser_version: number;

  /**
   * The current parsing line number, for use in Python preprocessor functions.
   * See the module docstring.
   */
  linenr: number;

  /**
   * A list like 'defined_syms', but with duplicates removed. Just the first
   * instance is kept for symbols defined in multiple locations. Kconfig order
   * is preserved otherwise.
   *
   * Using this attribute instead of 'defined_syms' can save work, and
   * automatically gives reasonable behavior when writing configuration output
   * (symbols defined in multiple locations only generate output once, while
   * still preserving Kconfig order for readability).
   */
  unique_defined_syms: Sym[] = [];

  /**
   * Analogous to 'unique_defined_syms', for choices. Named choices can have
   * multiple definition locations.
   */
  unique_choices: Choice[] = [];

  /**
   * The root Kconfig file.
   */
  root_file: string;

  /**
   * Creates a new Kconfig object by parsing Kconfig files.
   * Note that Kconfig files are distinct from `.config` files, which store
   * configuration symbol values.
   *
   * Refer to the module documentation for environment variables that influence
   * default warning settings (e.g., `KCONFIG_WARN_UNDEF` and
   * `KCONFIG_WARN_UNDEF_ASSIGN`).
   *
   * This method raises a `KconfigError` on syntax or semantic errors, and an
   * `OSError` (or a subclass of `IOError`) on I/O errors. The error object
   * will have properties `errno`, `strerror`, and `filename` available.
   * Note that `IOError` is an alias for `OSError` in Python 3, so it is sufficient
   * to catch `OSError` in that case.
   *
   * @param options - Configuration options for loading the Kconfig file.
   * @throws {KconfigError} - If the Kconfig file cannot be parsed.
   */
  constructor(options?: {
    /**
     * The Kconfig file to load. Defaults to "Kconfig".
     */
    filename?: string;

    /**
     * Whether to generate warnings related to this configuration. Defaults to `true`.
     */
    warn?: boolean;

    /**
     * Whether to generate informational messages. Defaults to `true`.
     */
    info?: boolean;

    /**
     * Whether warnings should be printed to `stderr` in addition to being added to
     * `Kconfig.warnings`. Defaults to `true`.
     */
    warn_to_stderr?: boolean;

    /**
     * The encoding to use when reading and writing files, and when decoding output
     * from commands run via `$(shell)`. Defaults to `"utf-8"`.
     */
    encoding?: string;

    /**
     * The parser version to use. If not provided, it will be determined from the
     * `KCONFIG_PARSER_VERSION` environment variable, or default to `1`.
     */
    parser_version?: number | null;

    /**
     * Whether to enable verbose output.
     */
    verbose?: boolean;
  }) {
    const {
      filename = 'Kconfig',
      warn = true,
      info = true,
      warn_to_stderr = true,
      encoding = 'utf-8',
      parser_version = null,
      verbose = false,
    } = options ?? {};

    logger.isLogVerbose = verbose;
    this._encoding = encoding as BufferEncoding;
    this.parser_version = parser_version ?? parseInt(process.env.KCONFIG_PARSER_VERSION || '1');
    this.srctree = process.env.srctree || '';
    this._srctree_prefix = resolve(this.srctree) + sep;
    this.warn = warn;
    this.info = info;
    this.warn_to_stderr = warn_to_stderr;
    this.warn_assign_undef = process.env.KCONFIG_WARN_UNDEF_ASSIGN === 'y';
    this.warn_assign_override = true;
    this.warn_assign_redun = true;
    this._warn_assign_no_prompt = true;
    this.warnings = [];
    this.config_prefix = process.env.CONFIG_ || 'CONFIG_';
    const SET_MATCH_REGEX = new RegExp('^' + this.config_prefix + '([^=]+)=(.*)', 'u');
    this._set_match = (s: string) => {
      return s.match(SET_MATCH_REGEX);
    };
    const UNSET_MATCH_REGEX = new RegExp('^# ' + this.config_prefix + '([^ ]+) is not set', 'u');
    this._unset_match = (s: string) => {
      return s.match(UNSET_MATCH_REGEX);
    };
    this.config_header = process.env.KCONFIG_CONFIG_HEADER || '';
    this.header_header = process.env.KCONFIG_AUTOHEADER_HEADER || '';
    this.syms = {};
    this.const_syms = {};
    this.defined_syms = [];
    this.missing_syms = [];
    this.named_choices = {};
    this.choices = [];
    this.menus = [];
    this.comments = [];

    for (const ny of ['n', 'y']) {
      const sym = new Sym({
        kconfig: this,
        name: ny,
        is_constant: true,
      });
      sym.orig_type = BOOL;
      sym._cached_bool_val = STR_TO_BOOL[ny];
      this.const_syms[ny] = sym;
    }
    this.n = this.const_syms['n'];
    this.y = this.const_syms['y'];

    this.variables = {};
    this._functions = {
      info: [_info_fn, 1, 1],
      'error-if': [_error_if_fn, 2, 2],
      filename: [_filename_fn, 0, 0],
      lineno: [_lineno_fn, 0, 0],
      shell: [_shell_fn, 1, 1],
      'warning-if': [_warning_if_fn, 2, 2],
    };
    if (process.env.KCONFIG_FUNCTIONS) {
      logger.error('not implemented: env KCONFIG_FUNCTIONS');
    }
    this._parsing_kconfigs = true;
    this.defconfig_list = null;
    this._include_path = [];
    this.top_node = new MenuNode({
      kconfig: this,
      item: MENU,
      is_menuconfig: true,
      prompt: ['Main menu', this.y],
      filename,
      linenr: 1,
    });
    this.kconfig_filenames = [filename];
    this.env_vars = new Set();
    this._filestack = [];
    this.filename = filename;
    this.linenr = 0;
    this._reuse_tokens = false;
    this.root_file = join(this.srctree, this.filename);
    const fileContent = readFileSync(join(this.srctree, this.filename), { encoding: this._encoding });
    const fileLines = fileContent.split(/\r?\n/);
    this._readline = () => {
      const line = fileLines.shift();
      return line !== undefined ? `${line}\n` : '';
    };
    this.__call__();
  }

  /**
   * In order to untagle the code, parsing of the Kconfig files is done in a separate function.
   */
  __call__() {
    try {
      // Parse the Kconfig files. Returns the last node, which we terminate with '.next = None'.
      if (this.parser_version === 1) {
        const prev = this._parse_block(null, this.top_node, this.top_node);
        this.top_node.list = this.top_node.next;
        prev.next = null;
      } else {
        const prev = this._new_parse(null, this.top_node, this.top_node);
        prev.next = null;
      }
      this.top_node.next = null;
    } catch (e) {
      logger.error(e);
      throw e;
    }

    this._parsing_kconfigs = false;

    // Do various menu tree post-processing
    this._finalize_node(this.top_node, this.y);

    this.unique_defined_syms = _ordered_unique(this.defined_syms);

    this.unique_choices = _ordered_unique(this.choices);

    // Do sanity checks. Some of these depend on everything being finalized.
    this._check_sym_sanity();
    this._check_choice_sanity();

    this._check_multiple_definitions();
    // KCONFIG_STRICT is an older alias for KCONFIG_WARN_UNDEF, supported
    // for backwards compatibility
    if (process.env.KCONFIG_WARN_UNDEF === 'y' || process.env.KCONFIG_STRICT === 'y') {
      this._check_undef_syms();
    }

    // Build Sym._dependents for all symbols and choices
    this._build_dep();

    // Check for dependency loops
    const check_dep_loop_sym = _check_dep_loop_sym; // Micro-optimization
    for (const sym of this.unique_defined_syms) {
      check_dep_loop_sym(sym, false);
    }

    // Add extra dependencies from choices to choice symbols that get
    // awkward during dependency loop detection
    this._add_choice_deps();

    return this;
  }

  /**
   * The prompt (title) of the top menu (top_node). Defaults to "Main menu".
   * Can be changed with the 'mainmenu' statement.
   */
  get mainmenu_text(): string {
    return this.top_node.prompt![0];
  }

  /**
   * The filename given by the defconfig_list symbol. This is taken from the
   * first 'default' with a satisfied condition where the specified file
   * exists (can be opened for reading). If a defconfig file foo/defconfig is
   * not found and $srctree was set when the Kconfig was created,
   * $srctree/foo/defconfig is looked up as well.
   *
   * 'defconfig_filename' is None if either no defconfig_list symbol exists,
   * or if the defconfig_list symbol has no 'default' with a satisfied
   * condition that specifies a file that exists.
   *
   * Gotcha: scripts/kconfig/Makefile might pass --defconfig=<defconfig> to
   * scripts/kconfig/conf when running e.g. 'make defconfig'. This option
   * overrides the defconfig_list symbol, meaning defconfig_filename might not
   * always match what 'make defconfig' would use.
   */
  get defconfig_filename(): string | null {
    if (this.defconfig_list) {
      for (const [filename, cond] of this.defconfig_list.defaults) {
        if (expr_value(cond)) {
          try {
            const filePath = this._open_config(filename.str_value);
            return filePath;
          } catch {}
        }
      }
    }
    return null;
  }

  /**
   * Loads symbol values from a file in the .config format. Equivalent to
   * calling Sym.set_value() to set each of the values.
   *
   * "# CONFIG_FOO is not set" within a .config file sets the user value of
   * FOO to n. The C tools work the same way.
   *
   * For each symbol, the Sym._user_value attribute holds the value the
   * symbol was assigned in the .config file (if any). The user value might
   * differ from Sym.str/bool_value if there are unsatisfied dependencies.
   *
   * Calling this function also updates the Kconfig.missing_syms attribute
   * with a list of all assignments to undefined symbols within the
   * configuration file. Kconfig.missing_syms is cleared if 'replace' is
   * True, and appended to otherwise. See the documentation for
   * Kconfig.missing_syms as well.
   *
   * See the Kconfig.__init__() docstring for raised exceptions
   * (OSError/IOError). KconfigError is never raised here.
   *
   * @param filename - Path to load configuration from (a string). Respects $srctree if set
   *                   (see the class documentation).
   *                   If 'filename' is None (the default), the configuration file to load
   *                   (if any) is calculated automatically, giving the behavior you'd
   *                   usually want:
   *                     1. If the KCONFIG_CONFIG environment variable is set, it gives the
   *                        path to the configuration file to load. Otherwise, ".config" is
   *                        used. See standard_config_filename().
   *                     2. If the path from (1.) doesn't exist, the configuration file
   *                        given by kconf.defconfig_filename is loaded instead, which is
   *                        derived from the 'option defconfig_list' symbol.
   *                     3. If (1.) and (2.) fail to find a configuration file to load, no
   *                        configuration file is loaded, and symbols retain their current
   *                        values (e.g., their default values). This is not an error.
   *                   See the return value as well.
   * @param replace - If True, all existing user values will be cleared before loading the
   *                  .config. Pass False to merge configurations.
   * @param verbose - Limited backwards compatibility to prevent crashes. A warning is
   *                  printed if anything but None is passed.
   *                  Prior to Kconfiglib 12.0.0, this option enabled printing of messages
   *                  to stdout when 'filename' was None. A message is (always) returned
   *                  now instead, which is more flexible.
   *                  Will probably be removed in some future version.
   * @returns A string with a message saying which file got loaded (or
   *          possibly that no file got loaded, when 'filename' is None). This is
   *          meant to reduce boilerplate in tools, which can do e.g.
   *          print(kconf.load_config()). The returned message distinguishes between
   *          loading (replace == True) and merging (replace == False).
   */
  load_config(filename: string | null = null, replace: boolean = true, verbose: any = null): string {
    if (verbose !== null) {
      _warn_verbose_deprecated('load_config');
    }

    let msg: string | null = null;
    if (filename === null) {
      filename = standard_config_filename();
      if (!existsSync(filename) && !existsSync(join(this.srctree, filename))) {
        const defconfig = this.defconfig_filename;
        if (defconfig === null) {
          return `Using default symbol values (no '${filename}')`;
        }

        msg = ` default configuration '${defconfig}' (no '${filename}')`;
        filename = defconfig;
      }
    }

    if (!msg) {
      msg = ` configuration '${filename}'`;
    }

    // Disable the warning about assigning to symbols without prompts. This
    // is normal and expected within a .config file.
    this._warn_assign_no_prompt = false;

    // This stub only exists to make sure _warn_assign_no_prompt gets re-enabled
    try {
      this._load_config(filename, replace);
    } catch (e) {
      logger.error(e);
    } finally {
      this._warn_assign_no_prompt = true;
    }

    return (replace ? `Loaded` : `Merged`) + msg;
  }

  _load_config(filename: string, replace: boolean): void {
    const filePath = this._open_config(filename);
    const fileContent = readFileSync(filePath, { encoding: this._encoding });
    const lines = fileContent.split(/\r?\n/);

    if (replace) {
      this.missing_syms = [];

      // If we're replacing the configuration, keep track of which
      // symbols and choices got set so that we can unset the rest
      // later. This avoids invalidating everything and is faster.
      // Another benefit is that invalidation must be rock solid for
      // it to work, making it a good test.

      for (const sym of this.unique_defined_syms) {
        sym._was_set = false;
      }

      for (const choice of this.unique_choices) {
        choice._was_set = false;
      }
    }

    // Small optimizations
    const set_match = this._set_match;
    const unset_match = this._unset_match;
    const get_sym = (name: string) => this.syms[name];

    for (let linenr = 1; linenr <= lines.length; linenr++) {
      const line = lines[linenr - 1].trimEnd();

      const match = set_match(line);
      let sym: Sym;
      let val: string;
      if (match) {
        const name = match[1];
        val = match[2];
        sym = get_sym(name);
        if (!sym || sym.nodes.length === 0) {
          this._undef_assign(name, val, filename, linenr);
          continue;
        }

        if (sym.orig_type === _T_BOOL) {
          // The C implementation only checks the first character
          // to the right of '=', for whatever reason
          if (!val.startsWith('y') && !val.startsWith('n')) {
            this._warn(
              `'${val}' is not a valid value for the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc}. Assignment ignored.`,
              filename,
              linenr,
            );
            continue;
          }

          val = val[0];

          if (sym.choice && val !== 'n') {
            // During .config loading, we infer the mode of the
            // choice from the kind of values that are assigned
            // to the choice symbols

            const prevMode = sym.choice._user_value;
            if (prevMode !== null && BOOL_TO_STR[prevMode] !== val) {
              this._warn('both m and y assigned to symbols within the same choice', filename, linenr);
            }

            // Set the choice's mode
            sym.choice.set_value(val);
          }
        } else if (sym.orig_type === _T_STRING) {
          const match = _conf_string_match(val);
          if (!match) {
            this._warn(
              `malformed string literal in assignment to ${sym.name_and_loc}. Assignment ignored.`,
              filename,
              linenr,
            );
            continue;
          }

          val = unescape(match[1]);
        }
      } else {
        const match = unset_match(line);
        if (!match) {
          // Print a warning for lines that match neither
          // set_match() nor unset_match() and that are not blank
          // lines or comments. 'line' has already been
          // rstrip()'d, so blank lines show up as "" here.
          if (line && !line.trimStart().startsWith('#')) {
            this._warn(`ignoring malformed line '${line}'`, filename, linenr);
          }

          continue;
        }

        const name = match[1];
        sym = get_sym(name);
        if (!sym || sym.nodes.length === 0) {
          this._undef_assign(name, 'n', filename, linenr);
          continue;
        }

        if (sym.orig_type !== _T_BOOL) {
          continue;
        }

        val = 'n';
      }

      // Done parsing the assignment. Set the value.

      if (sym._was_set) {
        this._assigned_twice(sym, val, filename, linenr);
      }

      sym.set_value(val);
    }

    if (replace) {
      // If we're replacing the configuration, unset the symbols that
      // didn't get set

      for (const sym of this.unique_defined_syms) {
        if (!sym._was_set) {
          sym.unset_value();
        }
      }

      for (const choice of this.unique_choices) {
        if (!choice._was_set) {
          choice.unset_value();
        }
      }
    }
  }

  /**
   * Called for assignments to undefined symbols during .config loading
   */
  _undef_assign(name: string, val: string, filename: string, linenr: number): void {
    this.missing_syms.push([name, val]);
    if (this.warn_assign_undef) {
      this._warn(`attempt to assign the value '${val}' to the undefined symbol ${name}`, filename, linenr);
    }
  }

  /**
   * Called when a symbol is assigned more than once in a .config file
   */
  _assigned_twice(sym: Sym, new_val: string, filename: string, linenr: number): void {
    // Use strings for bool user values in the warning
    let user_val: string;
    if (sym.orig_type === BOOL) {
      user_val = BOOL_TO_STR[sym._user_value as number];
    } else {
      user_val = String(sym._user_value);
    }

    const msg = `${sym.name_and_loc} set more than once. Old value "${user_val}", new value "${new_val}".`;

    if (user_val === new_val) {
      if (this.warn_assign_redun) {
        this._warn(msg, filename, linenr);
      }
    } else if (this.warn_assign_override) {
      this._warn(msg, filename, linenr);
    }
  }

  /**
   * Writes out symbol values as a C header file, matching the format used
   * by include/generated/autoconf.h in the kernel.
   *
   * The ordering of the #defines matches the one generated by write_config().
   * The order in the C implementation depends on the hash table implementation
   * as of writing, and so won't match.
   *
   * If 'filename' exists and its contents is identical to what would get
   * written out, it is left untouched. This avoids updating file metadata
   * like the modification time and possibly triggering redundant work in
   * build tools.
   *
   * @param filename - Path to write header to. If None (the default), the
   * path in the environment variable KCONFIG_AUTOHEADER is used if set,
   * and "include/generated/autoconf.h" otherwise. This is compatible
   * with the C tools.
   *
   * @param header - Text inserted verbatim at the beginning of the file.
   * You would usually want it enclosed in '/* *\/' to make it a C comment,
   * and include a trailing newline. If None (the default), the value of
   * the environment variable KCONFIG_AUTOHEADER_HEADER had when the
   * Kconfig instance was created will be used if it was set, and no
   * header otherwise. See the Kconfig.header_header attribute.
   *
   * @returns A string with a message saying that the header got saved,
   * or that there were no changes to it. This is meant to reduce boilerplate
   * in tools, which can do e.g. print(kconf.write_autoconf()).
   */
  write_autoconf(filename: string | null = null, header: string | null = null): string {
    if (filename === null) {
      filename = process.env.KCONFIG_AUTOHEADER || 'include/generated/autoconf.h';
    }

    if (this._write_if_changed(filename, this._autoconf_contents(header))) {
      return `Kconfig header saved to '${filename}'`;
    }
    return `No change to Kconfig header in '${filename}'`;
  }

  /**
   * write_autoconf() helper. Returns the contents to write as a string,
   * with 'header' or KCONFIG_AUTOHEADER_HEADER at the beginning.
   */
  _autoconf_contents(header: string | null): string {
    if (header === null) {
      header = this.header_header;
    }

    const chunks: string[] = [header];
    for (const sym of this.unique_defined_syms) {
      // _write_to_conf is determined when the value is calculated. This
      // is a hidden function call due to property magic.
      //
      // Note: In client code, you can check if sym.config_string is empty
      // instead, to avoid accessing the internal _write_to_conf variable
      // (though it's likely to keep working).
      let val = sym.str_value;
      if (!sym._write_to_conf) {
        continue;
      }

      if (sym.orig_type === BOOL && val === 'y') {
        chunks.push(`#define ${this.config_prefix}${sym.name} 1\n`);
      } else if (sym.orig_type === STRING) {
        chunks.push(`#define ${this.config_prefix}${sym.name} "${escape(val)}"\n`);
      } else if (_INT_HEX.includes(sym.orig_type)) {
        if (sym.orig_type === HEX && !val.startsWith('0x') && !val.startsWith('0X')) {
          val = '0x' + val;
        }
        chunks.push(`#define ${this.config_prefix}${sym.name} ${val}\n`);
      }
    }

    return chunks.join('');
  }

  /**
   * Writes out symbol values in the .config format. The format matches the
   * C implementation, including ordering.
   *
   * Symbols appear in the same order in generated .config files as they do
   * in the Kconfig files. For symbols defined in multiple locations, a
   * single assignment is written out corresponding to the first location
   * where the symbol is defined.
   *
   * See the 'Intro to symbol values' section in the module docstring to
   * understand which symbols get written out.
   *
   * If 'filename' exists and its contents is identical to what would get
   * written out, it is left untouched. This avoids updating file metadata
   * like the modification time and possibly triggering redundant work in
   * build tools.
   *
   * @param filename - Path to write configuration to. If None (the default),
   * the path in the environment variable KCONFIG_CONFIG is used if set,
   * and ".config" otherwise.
   *
   * @param header - Text inserted verbatim at the beginning of the file.
   * You would usually want each line to start with '#' to make it a comment,
   * and include a trailing newline.
   *
   * @param save_old - If True and <filename> already exists, a copy of it will
   * be saved to <filename>.old in the same directory before the new configuration is
   * written. Default is True.
   *
   * @param verbose - Limited backwards compatibility to prevent crashes.
   * A warning is printed if anything but None is passed.
   *
   * @returns A string with a message saying which file got saved. This is
   * meant to reduce boilerplate in tools, which can do e.g. print(kconf.write_config()).
   */
  write_config(
    filename: string | null = null,
    header: string | null = null,
    save_old: boolean = true,
    verbose: any = null,
  ): string {
    if (verbose !== null) {
      _warn_verbose_deprecated('write_config');
    }

    if (filename === null) {
      filename = standard_config_filename();
    }

    const contents = this._config_contents(header);
    if (this._contents_eq(filename, contents)) {
      return `No change to configuration in '${filename}'`;
    }

    if (save_old) {
      _save_old(filename);
    }

    writeFileSync(filename, contents, { encoding: this._encoding });

    return `Configuration saved to '${filename}'`;
  }

  /**
   * Returns the current configuration contents as a string.
   *
   * @returns The current configuration contents.
   */
  return_config(): string {
    return this._config_contents(null);
  }

  /**
   * write_config() helper. Returns the contents to write as a string,
   * with 'header' or KCONFIG_CONFIG_HEADER at the beginning.
   */
  _config_contents(header: string | null): string {
    // More memory friendly would be to 'yield' the strings and
    // "".join(_config_contents()), but it was a bit slower on my system.

    for (const sym of this.unique_defined_syms) {
      sym._visited = false;
    }

    if (header === null) {
      header = this.config_header;
    }

    const chunks: string[] = [header]; // "".join()ed later

    // Did we just print an '# end of ...' comment?
    let after_end_comment = false;

    let node: MenuNode = this.top_node;

    while (true) {
      // Jump to the next node with an iterative tree walk
      if (node.list) {
        node = node.list;
      } else if (node.next) {
        node = node.next;
      } else {
        while (node.parent) {
          node = node.parent;

          // Add a comment when leaving visible menus
          if (node.item === MENU && expr_value(node.dep) && expr_value(node.visibility) && node !== this.top_node) {
            chunks.push(`# end of ${node.prompt![0]}\n`);
            after_end_comment = true;
          }

          if (node.next) {
            node = node.next;
            break;
          }
        }
        if (!node.parent) {
          // No more nodes
          return chunks.join('');
        }
      }

      // Generate configuration output for the node
      const item = node.item;

      if (item instanceof Sym) {
        if (item._visited) {
          continue;
        }
        item._visited = true;

        const conf_string = item.config_string;
        if (!conf_string) {
          continue;
        }

        if (after_end_comment) {
          // Add a blank line before the first symbol printed after an
          // '# end of ...' comment
          after_end_comment = false;
          chunks.push('\n');
        }
        chunks.push(conf_string);
      } else if (expr_value(node.dep) && ((item === MENU && expr_value(node.visibility)) || item === COMMENT)) {
        chunks.push(`\n#\n# ${node.prompt![0]}\n#\n`);
        after_end_comment = false;
      }
    }
  }

  /**
   * write_min_config() helper. Returns the contents to write as a string,
   * with 'header' or KCONFIG_CONFIG_HEADER at the beginning.
   */
  _min_config_contents(header: string | null): string {
    if (header === null) {
      header = this.config_header;
    }

    const chunks: string[] = [header];
    const add = (s: string) => chunks.push(s);
    for (const sym of this.unique_defined_syms) {
      // Skip symbols that cannot be changed. Only check
      // non-choice symbols, as selects don't affect choice
      // symbols.
      if (!sym.choice && sym.visibility <= expr_value(sym.rev_dep)) {
        continue;
      }

      // Skip symbols whose value matches their default
      if (sym.str_value === sym._str_default()) {
        continue;
      }

      if (
        sym.choice &&
        sym.choice._selection_from_defaults() === sym &&
        sym.orig_type === BOOL &&
        sym.bool_value === 2
      ) {
        continue;
      }

      add(sym.config_string);
    }

    return chunks.join('');
  }

  /**
   * Returns a generator for iterating through all MenuNode's in the Kconfig
   * tree. The iteration is done in Kconfig definition order (each node is
   * visited before its children, and the children of a node are visited
   * before the next node).
   *
   * The Kconfig.top_node menu node is skipped. It contains an implicit menu
   * that holds the top-level items.
   *
   * As an example, the following code will produce a list equal to
   * Kconfig.defined_syms:
   *
   *   defined_syms = Array.from(kconf.node_iter())
   *     .filter(node => node.item instanceof Sym)
   *     .map(node => node.item)
   *
   * @param unique_syms - If True, only the first MenuNode will be included for symbols defined
   *                     in multiple locations.
   *                     Using kconf.node_iter(True) in the example above would give a list
   *                     equal to unique_defined_syms.
   */
  *node_iter(unique_syms = false): Generator<MenuNode> {
    if (unique_syms) {
      for (const sym of this.unique_defined_syms) {
        sym._visited = false;
      }
    }

    let node = this.top_node;
    while (true) {
      // Jump to the next node with an iterative tree walk
      if (node.list) {
        node = node.list;
      } else if (node.next) {
        node = node.next;
      } else {
        while (node.parent) {
          node = node.parent;
          if (node.next) {
            node = node.next;
            break;
          }
        }
        if (!node.parent) {
          // No more nodes
          return;
        }
      }

      if (unique_syms && node.item instanceof Sym) {
        if (node.item._visited) {
          continue;
        }
        node.item._visited = true;
      }

      yield node;
    }
  }

  /**
   * Returns the bool value of the expression 's', represented as 0 and 2 for n, and y.
   * Raises KconfigError on syntax errors. Warns if undefined symbols are referenced.
   *
   * As an example, if FOO and BAR are bool symbols at least one of
   * which has the value y, then eval_string("y && (FOO || BAR)") returns
   * 2 (y).
   *
   * To get the string value of non-bool symbols, use
   * Sym.str_value. eval_string() always returns a bool value, and
   * all non-bool symbols have the bool value 0 (n).
   *
   * The expression parsing is consistent with how parsing works for
   * conditional ('if ...') expressions in the configuration, and matches
   * the C implementation.
   */
  eval_string(s: string): number {
    // The parser is optimized to be fast when parsing Kconfig files (where
    // an expression can never appear at the beginning of a line). We have
    // to monkey-patch things a bit here to reuse it.

    this.filename = '';

    this._tokens = this._tokenize('if ' + s);
    // Strip "if " to avoid giving confusing error messages
    this._line = s;
    this._tokens_i = 1; // Skip the 'if' token

    return expr_value(this._expect_expr_and_eol());
  }

  /**
   * Returns a string with information about the Kconfig object when it is
   * evaluated on e.g. the interactive console.
   */
  toString(): string {
    const status = (flag: boolean): string => (flag ? 'enabled' : 'disabled');

    return `<${[
      `configuration with ${Object.keys(this.syms).length} symbols`,
      `main menu prompt "${this.mainmenu_text}"`,
      this.srctree ? `srctree "${this.srctree}"` : 'srctree is current directory',
      `config symbol prefix "${this.config_prefix}"`,
      `warnings ${status(this.warn)}`,
      `printing of warnings to stderr ${status(this.warn_to_stderr)}`,
      `undef. symbol assignment warnings ${status(this.warn_assign_undef)}`,
      `overriding symbol assignment warnings ${status(this.warn_assign_override)}`,
      `redundant symbol assignment warnings ${status(this.warn_assign_redun)}`,
    ].join(', ')}>`;
  }

  /**
   * Opens a .config file. First tries to open 'filename', then
   * '$srctree/filename' if $srctree was set when the configuration was
   * loaded.
   */
  _open_config(filename: string): string {
    try {
      const p = filename;
      readFileSync(filename, { encoding: this._encoding });
      return p;
    } catch {
      // This will try opening the same file twice if $srctree is unset,
      // but it's not a big deal
      try {
        const p = join(this.srctree, filename);
        readFileSync(p, { encoding: this._encoding });
        return p;
      } catch (e: any) {
        const env_var_value = this.srctree ? `set to '${this.srctree}'` : 'unset or blank';
        throw new KconfigIOError(
          e,
          `Could not open '${filename}' (${e.code}: ${e.message}). Check that the $srctree ` +
            `environment variable (${env_var_value}) is set correctly.`,
        );
      }
    }
  }

  /**
   * Jumps to the beginning of a sourced Kconfig file, saving the previous
   * position and file object.
   *
   * @param filename - Absolute path to file
   */
  _enter_file(filename: string): void {
    logger.verbose(`entering file '${filename}'...`);
    // Path relative to $srctree, stored in e.g. this.filename (which makes
    // it indirectly show up in MenuNode.filename). Equals 'filename' for
    // absolute paths passed to 'source'.
    let rel_filename: string;
    if (filename.startsWith(this._srctree_prefix)) {
      // Relative path (or a redundant absolute path to within $srctree,
      // but it's probably fine to reduce those too)
      rel_filename = filename.slice(this._srctree_prefix.length);
    } else {
      // Absolute path
      rel_filename = filename;
    }

    this.kconfig_filenames.push(rel_filename);

    // Save include path and 'file' object (via its 'readline' function)
    // before entering the file
    this._filestack.push([this._include_path, this._readline]);

    this._include_path.push([this.filename, this.linenr]);

    // Check for recursive 'source'
    for (const [name] of this._include_path) {
      if (name === rel_filename) {
        throw new KconfigError(
          `\n${this.filename}:${this.linenr}: recursive 'source' of '${rel_filename}' detected. Check that ` +
            `environment variables are set correctly.\n` +
            `Include path:\n${this._include_path.map(([n, l]) => `${n}:${l}`).join('\n')}`,
        );
      }
    }

    try {
      const fileContent = readFileSync(filename, { encoding: this._encoding });
      const fileLines = fileContent.split(/\r?\n/);
      this._readline = () => {
        const line = fileLines.shift();
        return line !== undefined ? `${line}\n` : '';
      };
    } catch (e: any) {
      // We already know that the file exists
      throw new KconfigIOError(
        e,
        `${this.filename}:${this.linenr}: Could not open '${filename}' (in '${this._line.trim()}') (${e.code}: ${e.message})`,
      );
    }

    this.filename = rel_filename;
    this.linenr = 0;
  }

  /**
   * Returns from a Kconfig file to the file that sourced it. See
   * _enter_file().
   */
  _leave_file(): void {
    logger.verbose(`leaving file '${this.filename}'`);
    // Restore location from parent Kconfig file
    const parentFile = this._include_path.pop();
    if (parentFile) {
      [this.filename, this.linenr] = parentFile;
    }

    // Pop the last file state from the filestack
    const prevFileState = this._filestack.pop();
    if (prevFileState) {
      [this._include_path, this._readline] = prevFileState;
    }
  }

  /**
   * Fetches and tokenizes the next line from the current Kconfig file.
   * Returns false at EOF and true otherwise.
   */
  _tokenize_line(): boolean {
    // We might already have tokens from parsing a line and discovering that
    // it's part of a different construct
    if (this._reuse_tokens) {
      this._reuse_tokens = false;
      // this._tokens_i is known to be 1 here, because _parse_props()
      // leaves it like that when it can't recognize a line (or parses a
      // help text)
      return true;
    }

    // readline() returns '' over and over at EOF, which we rely on for help
    // texts at the end of files (see _line_after_help())
    let line = this._readline();
    if (!line) {
      return false;
    }
    this.linenr += 1;

    // Handle line joining
    while (line.endsWith('\\\n')) {
      line = line.slice(0, -2) + this._readline();
      this.linenr += 1;
    }

    this._tokens = this._tokenize(line);
    // Initialize to 1 instead of 0 to factor out code from _parse_block()
    // and _parse_props(). They immediately fetch this._tokens[0].
    this._tokens_i = 1;

    return true;
  }

  /**
   * Tokenizes a line after a help text. This case is special in that the
   * line has already been fetched (to discover that it isn't part of the
   * help text).
   */
  _line_after_help(line: string): void {
    // Handle line joining
    let currentLine = line;
    while (currentLine.endsWith('\\\n')) {
      currentLine = currentLine.slice(0, -2) + this._readline();
      this.linenr += 1;
    }

    this._tokens = this._tokenize(currentLine);
    this._reuse_tokens = true;
  }

  /**
   * Writes 'contents' into 'filename', but only if it differs from the
   * current contents of the file.
   */
  _write_if_changed(filename: string, contents: string): boolean {
    if (this._contents_eq(filename, contents)) {
      return false;
    }
    writeFileSync(filename, contents, { encoding: this._encoding });
    return true;
  }

  /**
   * Returns true if the contents of 'filename' is 'contents' (a string),
   * and false otherwise (including if 'filename' can't be opened/read)
   */
  _contents_eq(filename: string, contents: string): boolean {
    try {
      const fileContents = readFileSync(filename, { encoding: this._encoding });
      return fileContents.slice(0, contents.length + 1) === contents;
    } catch {
      // If the error here would prevent writing the file as well, we'll
      // notice it later
      return false;
    }
  }

  /**
   * Fetches the symbol 'name' from the symbol table, creating and
   * registering it if it does not exist. If '_parsing_kconfigs' is false,
   * it means we're in eval_string(), and new symbols won't be registered.
   */
  _lookup_sym(name: string): Sym {
    if (name in this.syms) {
      return this.syms[name];
    }

    const sym = new Sym({
      kconfig: this,
      name,
      is_constant: false,
    });

    if (this._parsing_kconfigs) {
      this.syms[name] = sym;
    } else {
      this._warn(`no symbol ${name} in configuration`);
    }

    return sym;
  }

  /**
   * Like _lookup_sym(), for constant (quoted) symbols
   */
  _lookup_const_sym(name: string): Sym {
    if (name in this.const_syms) {
      return this.const_syms[name];
    }

    const sym = new Sym({
      kconfig: this,
      name,
      is_constant: true,
    });

    if (this._parsing_kconfigs) {
      this.const_syms[name] = sym;
    }

    return sym;
  }

  /**
   * Parses 's', returning a None-terminated list of tokens. Registers any
   * new symbols encountered with _lookup(_const)_sym().
   *
   * Tries to be reasonably speedy by processing chunks of text via
   * regexes and string operations where possible. This is the biggest
   * hotspot during parsing.
   */
  _tokenize(s: string): Array<any> {
    this._line = s; // Used for error reporting

    // Initial token on the line
    let match = _command_match(s);
    if (!match) {
      if (isSpace(s) || s.trim().startsWith('#')) {
        return [null];
      }
      this._parse_error('unknown token at start of line');
    }

    // Tricky implementation detail: While parsing a token, 'token' refers
    // to the previous token. See _STRING_LEX for why this is needed.
    let token: number | string | Sym = _get_keyword(match[1]);
    if (!token) {
      // Backwards compatibility with old versions of the C tools, which
      // (accidentally) accepted stuff like "--help--" and "-help---".
      if (s.trim().replace(/[-]/g, '') === 'help') {
        return [_T_HELP, null];
      }

      // If the first token is not a keyword (and not a weird help token),
      // we have a preprocessor variable assignment (or a bare macro on a line)
      this._parse_assignment(s);
      return [null];
    }

    const tokens: any[] = [token];
    // The current index in the string being tokenized
    let i = match.index! + match[0].length;

    // Main tokenization loop (for tokens past the first one)
    while (i < s.length) {
      // Test for an identifier/keyword first. This is the most common case.
      match = _id_keyword_match(s, i);
      if (match) {
        const matchEnd = match.index! + match[0].length;
        // We have an identifier or keyword
        let name = match[1];
        const keyword = _get_keyword(name);

        if (keyword) {
          // It's a keyword
          token = keyword;
          i = matchEnd;
        } else if (!_STRING_LEX.some((v) => v === token)) {
          // It's a non-const symbol, except we translate n, and y
          // into the corresponding constant symbols

          if (name.includes('$')) {
            // Macro expansion within symbol name
            const [expandedName, newS, newI] = this._expand_name(s, i);
            name = expandedName;
            s = newS;
            i = newI;
          } else {
            i = matchEnd;
          }

          token = name in STR_TO_BOOL ? this.const_syms[name] : this._lookup_sym(name);
        } else {
          // It's a case of missing quotes. For example:
          //   menu unquoted_title
          //   config A
          //       bool unquoted_prompt
          //   endmenu
          // Named choices ('choice FOO') also end up here.

          if (token !== _T_CHOICE) {
            this._warn(
              `style: quotes recommended around '${name}' in '${this._line.trim()}'`,
              this.filename,
              this.linenr,
            );
          }

          token = name;
          i = matchEnd;
        }
      } else {
        // Neither a keyword nor a non-const symbol
        const c = s[i];

        if (c === '"' || c === "'") {
          let val;
          if (!s.includes('$') && !s.includes('\\')) {
            // Fast path for lines without $ and \. Find the matching quote.
            const endI = s.indexOf(c, i + 1) + 1;
            if (!endI) {
              this._parse_error('unterminated string');
            }
            val = s.slice(i + 1, endI - 1);
            i = endI;
          } else {
            // Slow path
            const [newS, endI] = this._expand_str(s, i);
            s = newS;

            // process.env and the $UNAME_RELEASE replace()
            // is a backwards compatibility hack
            val = expandvars(s.slice(i + 1, endI - 1).replace('$UNAME_RELEASE', process.platform));

            i = endI;
          }

          // This is the only place where we don't survive with a single token of lookback
          token = _STRING_LEX.some((v) => v === token) || tokens[0] === _T_OPTION ? val : this._lookup_const_sym(val);
        } else if (s.startsWith('&&', i)) {
          token = _T_AND;
          i += 2;
        } else if (s.startsWith('||', i)) {
          token = _T_OR;
          i += 2;
        } else if (c === '=') {
          token = _T_EQUAL;
          i += 1;
        } else if (s.startsWith('!=', i)) {
          token = _T_UNEQUAL;
          i += 2;
        } else if (c === '!') {
          token = _T_NOT;
          i += 1;
        } else if (c === '(') {
          token = _T_OPEN_PAREN;
          i += 1;
        } else if (c === ')') {
          token = _T_CLOSE_PAREN;
          i += 1;
        } else if (c === '#') {
          break;
        }
        // Very rare
        else if (s.startsWith('<=', i)) {
          token = _T_LESS_EQUAL;
          i += 2;
        } else if (c === '<') {
          token = _T_LESS;
          i += 1;
        } else if (s.startsWith('>=', i)) {
          token = _T_GREATER_EQUAL;
          i += 2;
        } else if (c === '>') {
          token = _T_GREATER;
          i += 1;
        } else {
          this._parse_error('unknown tokens in line');
        }

        // Skip trailing whitespace
        while (i < s.length && isSpace(s[i])) {
          i++;
        }
      }

      // Add the token
      tokens.push(token);
    }

    // null-terminating the token list makes token fetching simpler/faster
    tokens.push(null);

    return tokens;
  }

  /**
   * Helper for syntax checking and token fetching
   */
  _expect_sym(): Sym {
    const token = this._tokens[this._tokens_i];
    this._tokens_i += 1;

    if (!(token instanceof Sym)) {
      this._parse_error('expected symbol');
    }

    return token;
  }

  /**
   * Used for 'select' and 'imply' only. We know the token indices.
   */
  _expect_nonconst_sym(): Sym {
    const token = this._tokens[1];
    this._tokens_i = 2;

    if (!(token instanceof Sym) || token.is_constant) {
      this._parse_error('expected nonconstant symbol');
    }

    return token;
  }

  /**
   * Expects a string token followed by end of line
   */
  _expect_str_and_eol(): string {
    const token = this._tokens[this._tokens_i];
    this._tokens_i += 1;

    if (typeof token !== 'string') {
      this._parse_error('expected string');
    }

    if (this._tokens[this._tokens_i] !== null) {
      this._trailing_tokens_error();
    }

    return token;
  }

  /**
   * Expects an expression followed by end of line
   */
  _expect_expr_and_eol(): any {
    const expr = this._parse_expr();

    if (this._tokens[this._tokens_i] !== null) {
      this._trailing_tokens_error();
    }

    return expr;
  }

  /**
   * If the next token is 'token', removes it and returns True
   */
  _check_token(token: any): boolean {
    if (this._tokens[this._tokens_i] === token) {
      this._tokens_i += 1;
      return true;
    }
    return false;
  }

  _parse_assignment(s: string): void {
    // Parses a preprocessor variable assignment, registering the variable
    // if it doesn't already exist. Also takes care of bare macros on lines
    // (which are allowed, and can be useful for their side effects).

    // Expand any macros in the left-hand side of the assignment (the
    // variable name)
    s = s.trimStart(); // Equivalent to lstrip in Python
    let i = 0;

    while (true) {
      const match = _assignment_lhs_fragment_match(s, i);
      if (!match) break;

      i = match.index! + match[0].length;

      if (s.startsWith('$(', i)) {
        [s, i] = this._expand_macro(s, i, []);
      } else {
        break;
      }
    }

    if (isSpace(s)) {
      // We also accept a bare macro on a line (e.g.
      // $(warning-if,$(foo),ops)), provided it expands to a blank string
      return;
    }

    // Assigned variable
    const name = s.slice(0, i);

    // Extract assignment operator (=, :=, or +=) and value
    const rhsMatch = _assignment_rhs_match(s, i);
    if (!rhsMatch) {
      this._parse_error('syntax error');
    }

    let op = rhsMatch[1];
    const val = rhsMatch[2];

    let varObj: Variable;
    if (this.variables[name]) {
      // Already seen variable
      varObj = this.variables[name];
    } else {
      // New variable
      varObj = new Variable(this, name);
      varObj._n_expansions = 0;
      this.variables[name] = varObj;

      // += acts like = on undefined variables (defines a recursive
      // variable)
      if (op === '+=') {
        op = '=';
      }
    }

    if (op === '=') {
      varObj.is_recursive = true;
      varObj.value = val;
    } else if (op === ':=') {
      varObj.is_recursive = false;
      varObj.value = this._expand_whole(val, []);
    } else {
      // op === "+="
      // += does immediate expansion if the variable was last set
      // with :=
      varObj.value += ' ' + (varObj.is_recursive ? val : this._expand_whole(val, []));
    }
  }

  /**
   * Expands preprocessor macros in all of 's'. Used whenever we don't
   * have to worry about delimiters.
   */
  _expand_whole(s: string, args: string[]): string {
    let i = 0;
    while (true) {
      i = s.indexOf('$(', i);
      if (i === -1) {
        break;
      }
      [s, i] = this._expand_macro(s, i, args);
    }
    return s;
  }

  /**
   * Expands a symbol name starting at index 'i' in 's'.
   */
  _expand_name(s: string, i: number): [string, string, number] {
    const [newS, endI] = this._expand_name_iter(s, i);
    const name = s.slice(i, endI);

    // isspace() is False for empty strings
    if (!name.trim()) {
      // Avoid creating a Kconfig symbol with a blank name. It's almost
      // guaranteed to be an error.
      this._parse_error('macro expanded to blank string');
    }

    // Skip trailing whitespace
    let end_i = endI;
    while (end_i < s.length && isSpace(s[end_i])) {
      end_i++;
    }

    return [name, newS, end_i];
  }

  /**
   * Expands a symbol name starting at index 'i' in 's'.
   */
  _expand_name_iter(s: string, i: number): [string, number] {
    while (true) {
      const match = _name_special_search(s, i);
      if (!match) {
        return [s, s.length];
      }

      if (match[0] !== '$(') {
        return [s, match.index!];
      }
      [s, i] = this._expand_macro(s, match.index!, []);
    }
  }

  /**
   * Expands a quoted string starting at index 'i' in 's'. Handles both
   * backslash escapes and macro expansion.
   */
  _expand_str(s: string, i: number): [string, number] {
    const quote = s[i];
    i += 1; // Skip over initial "/'

    while (true) {
      const match = _string_special_search(s, i);
      if (!match) {
        this._parse_error('unterminated string');
      }

      const matchEnd = match.index! + match[0].length;
      if (match[0] === quote) {
        // Found the end of the string
        return [s, matchEnd];
      } else if (match[0] === '\\') {
        // Replace '\x' with 'x'. 'i' ends up pointing to the character
        // after 'x', which allows macros to be canceled with '\$(foo)'.
        i = matchEnd;
        s = s.slice(0, match.index!) + s.slice(i);
      } else if (match[0] === '$(') {
        // A macro call within the string
        [s, i] = this._expand_macro(s, match.index!, []);
      } else {
        // A ' quote within " quotes or vice versa
        i += +1;
      }
    }
  }

  /**
   * Expands a macro starting at index 'i' in 's'.
   */
  _expand_macro(s: string, i: number, args: string[]): [string, number] {
    let res = s.slice(0, i);
    i += 2; // Skip over "$("

    let arg_start = i; // Start of current macro argument
    const new_args: string[] = []; // Arguments of this macro call
    let nesting = 0; // Current parentheses nesting level

    while (true) {
      const match = _macro_special_search(s, i);
      if (!match) {
        this._parse_error('missing end parenthesis in macro expansion');
      }

      const matchStart = match.index!;
      const matchEnd = matchStart + match[0].length;
      if (match[0] === '(') {
        nesting += 1;
        i = matchEnd;
      } else if (match[0] === ')') {
        if (nesting) {
          nesting -= 1;
          i = matchEnd;
          continue;
        }

        // Found the end of the macro
        new_args.push(s.slice(arg_start, matchStart));

        try {
          // Does the macro look like an integer, with a corresponding argument?
          const argIndex = parseInt(new_args[0], 10);
          if (!isNaN(argIndex) && args[argIndex]) {
            res += args[argIndex];
          } else {
            // Regular variables are just functions without arguments
            res += this._fn_val(new_args);
          }
        } catch {
          res += this._fn_val(new_args);
        }

        return [res + s.slice(matchEnd), res.length];
      } else if (match[0] === ',') {
        i = matchEnd;
        if (nesting) {
          continue;
        }

        // Found the end of a macro argument
        new_args.push(s.slice(arg_start, matchStart));
        arg_start = i;
      } else {
        // match[0] === "$("
        // A nested macro call within the macro
        [s, i] = this._expand_macro(s, matchStart, args);
      }
    }
  }

  /**
   * Returns the result of calling the function args[0] with the arguments
   * args[1..len(args)-1]. Plain variables are treated as functions
   * without arguments.
   */
  _fn_val(args: string[]): string {
    const fn = args[0];

    if (fn in this.variables) {
      const variable = this.variables[fn];

      if (args.length === 1) {
        // Plain variable
        if (variable._n_expansions) {
          this._parse_error(`Preprocessor variable ${variable.name} recursively references itself`);
        }
      } else if (variable._n_expansions > 100) {
        // Allow functions to call themselves, but guess that functions
        // that are overly recursive are stuck
        this._parse_error(`Preprocessor function ${variable.name} seems stuck in infinite recursion`);
      }

      variable._n_expansions += 1;
      const res = this._expand_whole(this.variables[fn].value as string, args);
      variable._n_expansions -= 1;
      return res;
    }

    if (fn in this._functions) {
      // Built-in or user-defined function
      const [py_fn, min_arg, max_arg] = this._functions[fn];

      if (args.length - 1 < min_arg || (max_arg !== null && args.length - 1 > max_arg)) {
        let expected_args: string;
        if (min_arg === max_arg) {
          expected_args = min_arg.toString();
        } else if (max_arg === null) {
          expected_args = `${min_arg} or more`;
        } else {
          expected_args = `${min_arg}-${max_arg}`;
        }

        throw new KconfigError(
          `${this.filename}:${this.linenr}: bad number of arguments in call to ${fn}, ` +
            `expected ${expected_args}, got ${args.length - 1}`,
        );
      }

      return py_fn(this, ...args);
    }

    // Environment variables are tried last
    if (process.env[fn]) {
      this.env_vars.add(fn);
      return process.env[fn]!;
    }

    return '';
  }

  /**
   * Constructs an AND (&&) expression. Performs trivial simplification.
   */
  _make_and(e1: any, e2: any): any {
    if (e1 === this.y) {
      return e2;
    }

    if (e2 === this.y) {
      return e1;
    }

    if (e1 === this.n || e2 === this.n) {
      return this.n;
    }

    return [AND, e1, e2];
  }

  /**
   * Constructs an OR (||) expression. Performs trivial simplification.
   */
  _make_or(e1: any, e2: any): any {
    if (e1 === this.n) {
      return e2;
    }

    if (e2 === this.n) {
      return e1;
    }

    if (e1 === this.y || e2 === this.y) {
      return this.y;
    }

    return [OR, e1, e2];
  }

  /**
   * Temporary function to parse with new Parser
   *
   * @param end_token - deprecated, unused
   * @param parent - parent node - to which node to add the top node parsed here
   *                e.g.: parent = top_node -> to this node, we add (expected) MainMenu from file
   * @param last_node - node that was parsed as a last one before calling this function
   *                   will be deprecated probably as the call logic is different from the original
   * @returns node that was parsed as a last one in this function.
   *          probably will be deprecated as the call logic is different from the original.
   */
  _new_parse(_end_token: any, _parent: MenuNode, _last_node: MenuNode): MenuNode {
    throw new Error(`_new_parse is not implemented (${_last_node})`);
  }

  /**
   * Parses a block, which is the contents of either a file or an if,
   * menu, or choice statement.
   *
   * @param end_token - The token that ends the block, e.g. _T_ENDIF ("endif") for ifs.
   *                   None for files.
   * @param parent - The parent menu node, corresponding to a menu, Choice, or 'if'.
   *                'if's are flattened after parsing.
   * @param prev - The previous menu node. New nodes will be added after this one (by
   *              modifying 'next' pointers).
   *              'prev' is reused to parse a list of child menu nodes (for a menu or
   *              Choice): After parsing the children, the 'next' pointer is assigned
   *              to the 'list' pointer to "tilt up" the children above the node.
   * @returns the final menu node in the block (or 'prev' if the block is empty).
   *          This allows chaining.
   */
  _parse_block(end_token: any, parent: MenuNode, prev: MenuNode): MenuNode {
    while (this._tokenize_line()) {
      const t0 = this._tokens[0];

      if (t0 === _T_CONFIG || t0 === _T_MENUCONFIG) {
        // The tokenizer allocates Sym objects for us
        const sym = this._tokens[1];
        if (!(sym instanceof Sym) || sym.is_constant) {
          this._parse_error('missing or bad symbol name');
        }

        if (this._tokens[2] !== null) {
          this._trailing_tokens_error();
        }

        this.defined_syms.push(sym);

        const node = new MenuNode({
          kconfig: this,
          item: sym,
          is_menuconfig: t0 === _T_MENUCONFIG,
          parent: parent,
          filename: this.filename,
          linenr: this.linenr,
        });
        node.include_path = this._include_path;

        sym.nodes.push(node);

        this._parse_props(node);
        if (node.is_menuconfig && !node.prompt) {
          this._warn(`the menuconfig symbol ${sym.name_and_loc} has no prompt`);
        }

        prev.next = node;
        prev = node;
      } else if (t0 === null) {
        // Blank line
        continue;
      } else if (_SOURCE_TOKENS.includes(t0)) {
        let pattern = this._expect_str_and_eol();
        if (_REL_SOURCE_TOKENS.includes(t0)) {
          // Relative source
          pattern = join(dirname(this.filename), pattern);
        }

        // Sort the glob results to ensure a consistent ordering of
        // Kconfig symbols, which indirectly ensures a consistent
        // ordering in e.g. .config files
        if (!isAbsolute(pattern)) {
          pattern = join(this._srctree_prefix, pattern);
        }
        const filenames = glob.sync(pattern.replace(/\\/g, '/'), { absolute: true }).sort();

        if (filenames.length === 0 && _OBL_SOURCE_TOKENS.includes(t0)) {
          throw new KconfigError(
            `${this.filename}:${this.linenr}: '${pattern}' not found (in '${this._line.trim()}'). ` +
              `Check that environment variables are set correctly (e.g. $srctree, which is ` +
              `${this.srctree ? `set to '${this.srctree}'` : 'unset or blank'}). ` +
              `Also note that unset environment variables expand to the empty string.`,
          );
        }

        for (const filename of filenames) {
          this._enter_file(filename);
          prev = this._parse_block(null, parent, prev);
          this._leave_file();
        }
      } else if (t0 === end_token) {
        // Reached the end of the block. Terminate the final node and return it.
        if (this._tokens[1] !== null) {
          this._trailing_tokens_error();
        }

        prev.next = null;
        return prev;
      } else if (t0 === _T_IF) {
        const node = new MenuNode({
          kconfig: this,
          parent: parent,
          dep: this._expect_expr_and_eol(),
        });

        this._parse_block(_T_ENDIF, node, node);
        node.list = node.next;

        prev.next = node;
        prev = node;
      } else if (t0 === _T_MENU) {
        const node = new MenuNode({
          kconfig: this,
          item: t0,
          is_menuconfig: true,
          parent: parent,
          prompt: [this._expect_str_and_eol(), this.y],
          visibility: this.y,
          filename: this.filename,
          linenr: this.linenr,
        });
        node.include_path = this._include_path;

        this.menus.push(node);

        this._parse_props(node);
        this._parse_block(_T_ENDMENU, node, node);
        node.list = node.next;

        prev.next = node;
        prev = node;
      } else if (t0 === _T_COMMENT) {
        const node = new MenuNode({
          kconfig: this,
          item: t0,
          is_menuconfig: false,
          parent: parent,
          prompt: [this._expect_str_and_eol(), this.y],
          filename: this.filename,
          linenr: this.linenr,
        });
        node.list = null;
        node.include_path = this._include_path;

        this.comments.push(node);

        this._parse_props(node);

        prev.next = node;
        prev = node;
      } else if (t0 === _T_CHOICE) {
        let choice: Choice;
        if (this._tokens[1] === null) {
          choice = new Choice({ kconfig: this, direct_dep: this.n });
        } else {
          // Named choice
          const name = this._expect_str_and_eol();
          choice = this.named_choices[name];
          if (!choice) {
            choice = new Choice({
              kconfig: this,
              name: name,
              direct_dep: this.n,
            });
            this.named_choices[name] = choice;
          }
        }
        this.choices.push(choice);

        const node = new MenuNode({
          kconfig: this,
          item: choice,
          is_menuconfig: true,
          parent: parent,
          filename: this.filename,
          linenr: this.linenr,
        });
        choice.nodes.push(node);

        this._parse_props(node);
        this._parse_block(_T_ENDCHOICE, node, node);
        node.list = node.next;

        prev.next = node;
        prev = node;
      } else if (t0 === _T_MAINMENU) {
        this.top_node.prompt = [this._expect_str_and_eol(), this.y];
      } else {
        // A valid endchoice/endif/endmenu is caught by the 'end_token'
        // check above
        this._parse_error(
          t0 === _T_ENDCHOICE
            ? "no corresponding 'choice'"
            : t0 === _T_ENDIF
              ? "no corresponding 'if'"
              : t0 === _T_ENDMENU
                ? "no corresponding 'menu'"
                : 'unrecognized construct',
        );
      }
    }

    // End of file reached. Return the last node.
    if (end_token) {
      const expectedToken = end_token === _T_ENDCHOICE ? 'endchoice' : end_token === _T_ENDIF ? 'endif' : 'endmenu';

      throw new KconfigError(`error: expected ${expectedToken} at end of ${this.filename}`);
    }

    return prev;
  }

  /**
   * Parses an optional 'if <expr>' construct and returns the parsed
   * <expr>, or self.y if the next token is not _T_IF
   */
  _parse_cond(): any {
    const expr = this._check_token(_T_IF) ? this._parse_expr() : this.y;

    if (this._tokens[this._tokens_i] !== null) {
      this._trailing_tokens_error();
    }

    return expr;
  }

  /**
   * Parses and adds properties to the MenuNode 'node' (type, 'prompt',
   * 'default's, etc.) Properties are later copied up to symbols and
   * choices in a separate pass after parsing, in e.g.
   * _add_props_to_sym().
   *
   * An older version of this code added properties directly to symbols
   * and choices instead of to their menu nodes (and handled dependency
   * propagation simultaneously), but that loses information on where a
   * property is added when a symbol or choice is defined in multiple
   * locations. Some Kconfig configuration systems rely heavily on such
   * symbols, and better docs can be generated by keeping track of where
   * properties are added.
   *
   * node:
   *   The menu node we're parsing properties on
   */
  _parse_props(node: MenuNode): void {
    // Dependencies from 'depends on'. Will get propagated to the properties
    // below.
    node.dep = this.y;

    while (this._tokenize_line()) {
      const t0 = this._tokens[0];

      if (_TYPE_TOKENS.includes(t0)) {
        // Relies on '_T_BOOL is BOOL', etc., to save a conversion
        this._set_type(node.item as any, t0);
        if (this._tokens[1] !== null) {
          this._parse_prompt(node);
        }
      } else if (t0 === _T_DEPENDS) {
        if (!this._check_token(_T_ON)) {
          this._parse_error("expected 'on' after 'depends'");
        }
        node.dep = this._make_and(node.dep, this._expect_expr_and_eol());
      } else if (t0 === _T_HELP) {
        this._parse_help(node);
      } else if (t0 === _T_SELECT) {
        if (!(node.item instanceof Sym)) {
          this._parse_error('only symbols can select');
        }
        node.selects.push([this._expect_nonconst_sym(), this._parse_cond()]);
      } else if (t0 === null) {
        // Blank line
        continue;
      } else if (t0 === _T_DEFAULT) {
        node.defaults.push([this._parse_expr(), this._parse_cond()]);
      } else if (t0 === _T_PROMPT) {
        this._parse_prompt(node);
      } else if (t0 === _T_RANGE) {
        node.ranges.push([this._expect_sym(), this._expect_sym(), this._parse_cond()]);
      } else if (t0 === _T_IMPLY) {
        if (!(node.item instanceof Sym)) {
          this._parse_error('only symbols can imply');
        }
        node.implies.push([this._expect_nonconst_sym(), this._parse_cond()]);
      } else if (t0 === _T_VISIBLE) {
        if (!this._check_token(_T_IF)) {
          this._parse_error("expected 'if' after 'visible'");
        }
        node.visibility = this._make_and(node.visibility, this._expect_expr_and_eol());
      } else if (t0 === _T_OPTION) {
        if (this._check_token(_T_ENV)) {
          if (!this._check_token(_T_EQUAL)) {
            this._parse_error("expected '=' after 'env'");
          }
          const env_var = this._expect_str_and_eol();
          const nodeItem = node.item! as Sym;
          nodeItem.env_var = env_var;

          const envValue = process.env[env_var];
          if (envValue) {
            node.defaults.push([this._lookup_const_sym(envValue), this.y]);
          } else {
            this._warn(
              `${nodeItem.name_and_loc} has 'option env="${env_var}"', ` +
                `but the environment variable ${env_var} is not set`,
              this.filename,
              this.linenr,
            );
          }

          if (env_var !== nodeItem.name) {
            this._warn(
              'Kconfiglib expands environment variables ' +
                'in strings directly, meaning you do not ' +
                'need \'option env=...\' "bounce" symbols. ' +
                `For compatibility with the C tools, ` +
                `${nodeItem.name} to ${env_var} (so that the symbol name ` +
                'matches the environment variable name).',
              this.filename,
              this.linenr,
            );
          }
        } else if (this._check_token(_T_DEFCONFIG_LIST)) {
          const nodeItem = node.item! as Sym;
          if (!this.defconfig_list) {
            this.defconfig_list = nodeItem;
          } else {
            this._warn(
              "'option defconfig_list' set on multiple " +
                `${this.defconfig_list.name} and ${nodeItem.name}). Only ${this.defconfig_list.name} will be ` +
                'used.',
              this.filename,
              this.linenr,
            );
          }
        } else if (this._check_token(_T_ALLNOCONFIG_Y)) {
          if (!(node.item instanceof Sym)) {
            this._parse_error("the 'allnoconfig_y' option is only valid for symbols");
          }
          node.item.is_allnoconfig_y = true;
        } else {
          this._parse_error('unrecognized option');
        }
      } else if (t0 === _T_OPTIONAL) {
        if (!(node.item instanceof Choice)) {
          this._parse_error('"optional" is only valid for choices');
        }
      } else {
        // Reuse the tokens for the non-property line later
        this._reuse_tokens = true;
        return;
      }
    }
  }

  /**
   * Sets the type of 'sc' (symbol or choice) to 'new_type'
   */
  _set_type(symbol_or_choice: Sym | Choice, new_type: any): void {
    // UNKNOWN is falsy
    if (symbol_or_choice.orig_type && symbol_or_choice.orig_type !== new_type) {
      this._warn(`${symbol_or_choice.name_and_loc} defined with multiple types, ${TYPE_TO_STR[new_type]} will be used`);
    }
    symbol_or_choice.orig_type = new_type;
  }

  /**
   * 'prompt' properties override each other within a single definition of
   * a symbol, but additional prompts can be added by defining the symbol
   * multiple times
   */
  _parse_prompt(node: any): void {
    if (node.prompt) {
      this._warn(node.item.name_and_loc + ' defined with multiple prompts in single location');
    }
    let prompt = this._tokens[1];
    this._tokens_i = 2;

    if (typeof prompt !== 'string') {
      this._parse_error('expected prompt string');
    }

    if (prompt !== prompt.trim()) {
      this._warn(node.item.name_and_loc + ' has leading or trailing whitespace in its prompt');

      // This avoid issues for e.g. reStructuredText documentation, where
      // '*prompt *' is invalid
      prompt = prompt.trim();
    }

    node.prompt = [prompt, this._parse_cond()];
  }

  /**
   * Parses an expression from the tokens in Kconfig._tokens using a
   * simple top-down approach. See the module docstring for the expression
   * format.
   */
  _parse_help(node: any): void {
    if (node.help !== null) {
      this._warn(`${node.item.name_and_loc} defined with more than one help text -- only the last one will be used`);
    }

    // Micro-optimization. This code is pretty hot.
    const readline = this._readline;

    // Find first non-blank (not all-space) line and get its
    // indentation
    let line: string;
    while (true) {
      line = readline();
      this.linenr++;
      if (!line) {
        this._empty_help(node, line);
        return;
      }
      if (!isSpace(line)) {
        break;
      }
    }

    const len = (str: string) => str.length;

    // Use a separate 'expline' variable here and below to avoid stomping on
    // any tabs people might've put deliberately into the first line after
    // the help text
    const expline = line.replace(/\t/g, '    ');
    const indent = len(expline) - len(expline.trimStart());
    if (!indent) {
      this._empty_help(node, line);
      return;
    }

    // The help text goes on till the first non-blank line with less indent
    // than the first line

    // Add the first line
    const lines: string[] = [expline.substring(indent)];
    const add_line = (l: string) => lines.push(l);

    while (true) {
      line = readline();
      if (isSpace(line)) {
        // No need to preserve the exact whitespace in these
        add_line('\n');
      } else if (!line) {
        // End of file
        break;
      } else {
        const expline = line.replace(/\t/g, '    ');
        if (len(expline) - len(expline.trimStart()) < indent) {
          break;
        }
        add_line(expline.substring(indent));
      }
    }

    this.linenr += lines.length;
    node.help = lines.join('').trimEnd();
    if (line) {
      this._line_after_help(line);
    }
  }

  _empty_help(node: any, line: string): void {
    this._warn(node.item.name_and_loc + " has 'help' but empty help text");
    node.help = '';
    if (line) {
      this._line_after_help(line);
    }
  }

  /**
   * Parses an expression from the tokens in Kconfig._tokens using a
   * simple top-down approach. See the module docstring for the expression
   * format.
   *
   * Grammar:
   *
   *   expr:     and_expr ['||' expr]
   *   and_expr: factor ['&&' and_expr]
   *   factor:   <symbol> ['='/'!='/'<'/... <symbol>]
   *             '!' factor
   *             '(' expr ')'
   *
   * It helps to think of the 'expr: and_expr' case as a single-operand OR
   * (no ||), and of the 'and_expr: factor' case as a single-operand AND
   * (no &&). Parsing code is always a bit tricky.
   *
   * Mind dump: parse_factor() and two nested loops for OR and AND would
   * work as well. The straightforward implementation there gives a
   * (op, (op, (op, A, B), C), D) parse for A op B op C op D. Representing
   * expressions as (op, [list of operands]) instead goes nicely with that
   * version, but is wasteful for short expressions and complicates
   * expression evaluation and other code that works on expressions (more
   * complicated code likely offsets any performance gain from less
   * recursion too). If we also try to optimize the list representation by
   * merging lists when possible (e.g. when ANDing two AND expressions),
   * we end up allocating a ton of lists instead of reusing expressions,
   * which is bad.
   */
  _parse_expr(): any {
    const and_expr = this._parse_and_expr();

    // Return 'and_expr' directly if we have a "single-operand" OR.
    // Otherwise, parse the expression on the right and make an OR node.
    // This turns A || B || C || D into (OR, A, (OR, B, (OR, C, D))).
    return this._check_token(_T_OR) ? [OR, and_expr, this._parse_expr()] : and_expr;
  }

  _parse_and_expr(): any {
    const factor = this._parse_factor();

    // Return 'factor' directly if we have a "single-operand" AND.
    // Otherwise, parse the right operand and make an AND node. This turns
    // A && B && C && D into (AND, A, (AND, B, (AND, C, D))).
    return this._check_token(_T_AND) ? [AND, factor, this._parse_and_expr()] : factor;
  }

  _parse_factor(): any {
    const token = this._tokens[this._tokens_i];
    this._tokens_i++;

    if (token instanceof Sym) {
      // Plain symbol or relation

      if (!_RELATIONS.includes(this._tokens[this._tokens_i])) {
        // Plain symbol
        return token;
      }

      // Relation
      //
      // _T_EQUAL, _T_UNEQUAL, etc., deliberately have the same values as
      // EQUAL, UNEQUAL, etc., so we can just use the token directly
      this._tokens_i++;
      return [this._tokens[this._tokens_i - 1], token, this._expect_sym()];
    }

    if (token === _T_NOT) {
      // token == _T_NOT == NOT
      return [token, this._parse_factor()];
    }

    if (token === _T_OPEN_PAREN) {
      const expr_parse = this._parse_expr();
      if (this._check_token(_T_CLOSE_PAREN)) {
        return expr_parse;
      }
    }

    this._parse_error('malformed expression');
  }

  /**
   * Populates the Sym/Choice._dependents sets, which contain all other
   * items (symbols and choices) that immediately depend on the item in
   * the sense that changing the value of the item might affect the value
   * of the dependent items. This is used for caching/invalidation.
   *
   * The calculated sets might be larger than necessary as we don't do any
   * complex analysis of the expressions.
   */
  _build_dep(): void {
    const depend_on = _depend_on; // Micro-optimization

    // Only calculate _dependents for defined symbols. Constant and
    // undefined symbols could theoretically be selected/implied, but it
    // wouldn't change their value, so it's not a true dependency.
    for (const sym of this.unique_defined_syms) {
      // Symbols depend on the following:

      // The prompt conditions
      for (const node of sym.nodes) {
        if (node.prompt) {
          depend_on(sym, node.prompt[1]);
        }
      }

      // The default values and their conditions
      for (const [value, cond] of sym.defaults) {
        depend_on(sym, value);
        depend_on(sym, cond);
      }

      // The reverse and weak reverse dependencies
      depend_on(sym, sym.rev_dep);
      depend_on(sym, sym.weak_rev_dep);

      // The ranges along with their conditions
      for (const [low, high, cond] of sym.ranges) {
        depend_on(sym, low);
        depend_on(sym, high);
        depend_on(sym, cond);
      }

      // The direct dependencies. This is usually redundant, as the direct
      // dependencies get propagated to properties, but it's needed to get
      // invalidation solid for 'imply', which only checks the direct
      // dependencies (even if there are no properties to propagate it
      // to).
      depend_on(sym, sym.direct_dep);

      // In addition to the above, choice symbols depend on the choice
      // they're in, but that's handled automatically since the Choice is
      // propagated to the conditions of the properties before
      // _build_dep() runs.
    }

    for (const choice of this.unique_choices) {
      // Choices depend on the following:

      // The prompt conditions
      for (const node of choice.nodes) {
        if (node.prompt) {
          depend_on(choice, node.prompt[1]);
        }
      }

      // The default symbol conditions
      for (const [, cond] of choice.defaults) {
        depend_on(choice, cond);
      }
    }
  }

  /**
   * Choices also depend on the choice symbols themselves, because the
   * y-mode selection of the choice might change if a choice symbol's
   * visibility changes.
   *
   * We add these dependencies separately after dependency loop detection.
   * The invalidation algorithm can handle the resulting
   * <choice symbol> <-> <choice> dependency loops, but they make loop
   * detection awkward.
   */
  _add_choice_deps(): void {
    for (const choice of this.unique_choices) {
      for (const sym of choice.syms) {
        sym._dependents.add(choice);
      }
    }
  }

  /**
   * Undefined symbols never change value and don't need to be
   * invalidated, so we can just iterate over defined symbols.
   * Invalidating constant symbols would break things horribly.
   */
  _invalidate_all(): void {
    for (const sym of this.unique_defined_syms) {
      sym._invalidate();
    }

    for (const choice of this.unique_choices) {
      choice._invalidate();
    }
  }

  /**
   * Finalizes a menu node and its children:
   *
   *  - Copies properties from menu nodes up to their contained
   *    symbols/choices
   *
   *  - Propagates dependencies from parent to child nodes
   *
   *  - Creates implicit menus
   *
   *  - Removes 'if' nodes
   *
   *  - Sets 'choice' types and registers choice symbols
   *
   * menu_finalize() in the C implementation is similar.
   *
   * node:
   *   The menu node to finalize. This node and its children will have
   *   been finalized when the function returns, and any implicit menus
   *   will have been created.
   *
   * visible_if:
   *   Dependencies from 'visible if' on parent menus. These are added to
   *   the prompts of symbols and choices.
   */
  _finalize_node(node: any, visible_if: any): void {
    if (node.item instanceof Sym) {
      // Copy defaults, ranges, selects, and implies to the Sym
      this._add_props_to_sym(node);

      // Find any items that should go in an implicit menu rooted at the
      // symbol
      let cur = node;
      while (cur.next && _auto_menu_dep(node, cur.next)) {
        // This makes implicit submenu creation work recursively, with
        // implicit menus inside implicit menus
        this._finalize_node(cur.next, visible_if);
        cur = cur.next;
        cur.parent = node;
      }

      if (cur !== node) {
        // Found symbols that should go in an implicit submenu. Tilt
        // them up above us.
        node.list = node.next;
        node.next = cur.next;
        cur.next = null;
      }
    } else if (node.list) {
      // The menu node is a choice, menu, or if. Finalize each child node.

      if (node.item === MENU) {
        visible_if = this._make_and(visible_if, node.visibility);
      }

      // Propagate the menu node's dependencies to each child menu node.
      //
      // This needs to go before the recursive _finalize_node() call so
      // that implicit submenu creation can look ahead at dependencies.
      this._propagate_deps(node, visible_if);

      // Finalize the children
      let cur = node.list;
      while (cur) {
        this._finalize_node(cur, visible_if);
        cur = cur.next;
      }
    }

    if (node.list) {
      // node's children have been individually finalized. Do final steps
      // to finalize this "level" in the menu tree.
      _flatten(node.list);
      _remove_ifs(node);
    }

    // Empty choices (node.list None) are possible, so this needs to go
    // outside
    if (node.item instanceof Choice) {
      // Add the node's non-node-specific properties to the choice, like
      // _add_props_to_sym() does
      const choice = node.item;
      choice.direct_dep = this._make_or(choice.direct_dep, node.dep);
      choice.defaults = choice.defaults.concat(node.defaults);

      _finalize_choice(node);
    }
  }

  /**
   * Propagates 'node's dependencies to its child menu nodes
   */
  _propagate_deps(node: MenuNode, visible_if: any): void {
    // If the parent node holds a Choice, we use the Choice itself as the
    // parent dependency. This makes sense as the value (mode) of the choice
    // limits the visibility of the contained choice symbols. The C
    // implementation works the same way.
    //
    // Due to the similar interface, Choice works as a drop-in replacement
    // for Sym here.
    const basedep = node.item instanceof Choice ? node.item : node.dep;

    let cur = node.list;
    while (cur) {
      cur.dep = this._make_and(cur.dep, basedep);

      if (isSymbolOrChoice(cur.item)) {
        // Propagate 'visible if' and dependencies to the prompt
        if (cur.prompt) {
          cur.prompt = [cur.prompt[0], this._make_and(cur.prompt[1], this._make_and(visible_if, cur.dep))];
        }

        // Propagate dependencies to defaults
        if (cur.defaults) {
          cur.defaults = cur.defaults.map(([defaultValue, cond]) => [defaultValue, this._make_and(cond, cur!.dep)]);
        }

        // Propagate dependencies to ranges
        if (cur.ranges) {
          cur.ranges = cur.ranges.map(([low, high, cond]) => [low, high, this._make_and(cond, cur!.dep)]);
        }

        // Propagate dependencies to selects
        if (cur.selects) {
          cur.selects = cur.selects.map(([target, cond]) => [target, this._make_and(cond, cur!.dep)]);
        }

        // Propagate dependencies to implies
        if (cur.implies) {
          cur.implies = cur.implies.map(([target, cond]) => [target, this._make_and(cond, cur!.dep)]);
        }
      } else if (cur.prompt) {
        // Not a symbol/choice
        // Propagate dependencies to the prompt. 'visible if' is only
        // propagated to symbols/choices.
        cur.prompt = [cur.prompt[0], this._make_and(cur.prompt[1], cur.dep)];
      }

      cur = cur.next;
    }
  }

  /**
   * Copies properties from the menu node 'node' up to its contained
   * symbol, and adds (weak) reverse dependencies to selected/implied
   * symbols.
   *
   * This can't be rolled into _propagate_deps(), because that function
   * traverses the menu tree roughly breadth-first, meaning properties on
   * symbols defined in multiple locations could end up in the wrong
   * order.
   */
  _add_props_to_sym(node: any): void {
    const sym = node.item;

    sym.direct_dep = this._make_or(sym.direct_dep, node.dep);

    sym.defaults = sym.defaults.concat(node.defaults);
    sym.ranges = sym.ranges.concat(node.ranges);
    sym.selects = sym.selects.concat(node.selects);
    sym.implies = sym.implies.concat(node.implies);

    // Modify the reverse dependencies of the selected symbol
    for (const [target, cond] of node.selects) {
      target.rev_dep = this._make_or(target.rev_dep, this._make_and(sym, cond));
    }

    // Modify the weak reverse dependencies of the implied
    // symbol
    for (const [target, cond] of node.implies) {
      target.weak_rev_dep = this._make_or(target.weak_rev_dep, this._make_and(sym, cond));
    }
  }

  /**
   * Checks for multiple definitions of symbols and choices. If such a symbol or choice is found,
   * warning is generated.
   * NOTE: One Kconfig file can be sourced in multiple files, this case will manifest as several
   * nodes, but with the same filename and line number. This situation is not ideal, but allowable.
   */
  _check_multiple_definitions(): void {
    for (const sym of this.unique_defined_syms) {
      if (sym.nodes.length > 1) {
        const occurrences = new Set(sym.nodes.map((node) => `    ${node.filename}:${node.linenr}`));
        if (occurrences.size > 1) {
          const occurrencesStr = Array.from(occurrences).join('\n');
          this._info(
            `INFO: Sym ${sym.name} defined in multiple locations (see below). Please check if this is a correct behavior or a random name match:\n${occurrencesStr}`,
          );
        }
      }
    }

    for (const choice of this.unique_choices) {
      if (choice.nodes.length > 1) {
        const occurrences = new Set<string>(choice.nodes.map((node) => `    ${node.filename}:${node.linenr}`));
        if (occurrences.size > 1) {
          const occurrencesStr = Array.from(occurrences).join('\n');
          this._info(
            `INFO: Choice ${choice.name} defined in multiple locations (see below). Please check if this is a correct behavior or a random name match:\n${occurrencesStr}`,
          );
        }
      }
    }
  }

  /**
   * Checks various symbol properties that are handiest to check after
   * parsing. Only generates errors and warnings.
   */
  _check_sym_sanity(): void {
    const num_ok = (sym: Sym, type_: number): boolean => {
      // Returns True if the (possibly constant) symbol 'sym' is valid as a value
      // for a symbol of type type_ (INT or HEX)

      // 'not sym.nodes' implies a constant or undefined symbol, e.g. a plain
      // "123"
      if (!sym.nodes.length) {
        return _is_base_n(sym.name, _TYPE_TO_BASE[type_]);
      }
      return sym.orig_type === type_;
    };

    for (const sym of this.unique_defined_syms) {
      if (sym.orig_type === BOOL) {
        // A helper function could be factored out here, but keep it
        // speedy/straightforward

        for (const [target_sym] of sym.selects) {
          if (!_BOOL_UNKNOWN.includes(target_sym.orig_type)) {
            this._warn(
              `${sym.name_and_loc} selects the ${TYPE_TO_STR[target_sym.orig_type]} symbol ${target_sym.name_and_loc}, which is not bool`,
            );
          }
        }

        for (const [target_sym] of sym.implies) {
          if (!_BOOL_UNKNOWN.includes(target_sym.orig_type)) {
            this._warn(
              `${sym.name_and_loc} implies the ${TYPE_TO_STR[target_sym.orig_type]} symbol ${target_sym.name_and_loc}, which is not bool`,
            );
          }
        }
      } else if (sym.orig_type) {
        // STRING/INT/HEX
        for (const [default_] of sym.defaults) {
          if (!(default_ instanceof Sym)) {
            throw new KconfigError(
              `the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc} has a malformed default ${expr_str(default_)} -- expected a single symbol`,
            );
          }

          if (sym.orig_type === STRING) {
            if (!default_.is_constant && !default_.nodes && default_.name.toUpperCase() !== default_.name) {
              // 'default foo' on a string symbol could be either a symbol
              // reference or someone leaving out the quotes. Guess that
              // the quotes were left out if 'foo' isn't all-uppercase
              // (and no symbol named 'foo' exists).
              this._warn('style: quotes recommended around ' + `default value for string symbol ${sym.name_and_loc}`);
            }
          } else if (!num_ok(default_, sym.orig_type)) {
            // INT/HEX
            this._warn(
              `the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc} has a non-${TYPE_TO_STR[sym.orig_type]} default ${default_.name_and_loc}`,
            );
          }
        }

        if (sym.selects.length > 0 || sym.implies.length > 0) {
          this._warn(`the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc} has selects or implies`);
        }
      } else {
        // UNKNOWN
        this._warn(`${sym.name_and_loc} defined without a type`);
      }

      if (sym.ranges.length > 0) {
        if (!_INT_HEX.includes(sym.orig_type)) {
          this._warn(`the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc} has ranges, but is not int or hex`);
        } else {
          for (const [low, high] of sym.ranges) {
            if (!num_ok(low, sym.orig_type) || !num_ok(high, sym.orig_type)) {
              this._warn(
                `the ${TYPE_TO_STR[sym.orig_type]} symbol ${sym.name_and_loc} has a non-${TYPE_TO_STR[sym.orig_type]} range [${low.name_and_loc}, ${high.name_and_loc}]`,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Checks various choice properties that are handiest to check after
   * parsing. Only generates errors and warnings.
   */
  _check_choice_sanity(): void {
    const warn_select_imply = (sym: Sym, expr: any, expr_type: string): void => {
      let msg = `the choice symbol ${sym.name_and_loc} is ${expr_type} by the following symbols, but select/imply has no effect on choice symbols`;

      // si = select/imply
      for (const si of split_expr(expr, OR)) {
        msg += '\n - ' + split_expr(si, AND)[0].name_and_loc;
      }

      this._warn(msg);
    };

    for (const choice of this.unique_choices) {
      if (choice.orig_type !== BOOL) {
        this._warn(`${choice.name_and_loc} defined with type ${TYPE_TO_STR[choice.orig_type]}`);
      }

      for (const node of choice.nodes) {
        if (node.prompt) {
          break;
        }
      }
      if (!choice.nodes.some((node) => node.prompt)) {
        this._warn(choice.name_and_loc + ' defined without a prompt');
      }

      for (const [default_] of choice.defaults) {
        if (!(default_ instanceof Sym)) {
          throw new KconfigError(`${choice.name_and_loc} has a malformed default ${expr_str(default_)}`);
        }

        if (default_.choice !== choice) {
          this._warn(
            `the default selection ${default_.name_and_loc} of ${choice.name_and_loc} is not contained in the choice`,
          );
        }
      }

      for (const sym of choice.syms) {
        if (sym.defaults.length > 0) {
          this._warn(
            `default on the choice symbol ${sym.name_and_loc} will have ` +
              'no effect, as defaults do not affect choice ' +
              'symbols',
          );
        }

        if (sym.rev_dep !== sym.kconfig.n) {
          warn_select_imply(sym, sym.rev_dep, 'selected');
        }

        if (sym.weak_rev_dep !== sym.kconfig.n) {
          warn_select_imply(sym, sym.weak_rev_dep, 'implied');
        }

        for (const node of sym.nodes) {
          if (node.parent?.item === choice) {
            if (!node.prompt) {
              this._warn(`the choice symbol ${sym.name_and_loc} has no prompt`);
            }
          } else if (node.prompt) {
            this._warn(`the choice symbol ${sym.name_and_loc} is defined with a prompt outside the choice`);
          }
        }
      }
    }
  }

  /**
   * Raises a KconfigError with a formatted error message related to parsing issues.
   * @param msg The error message to include in the raised KconfigError.
   */
  _parse_error(msg: string): never {
    throw new KconfigError(
      `${this.filename ? `${this.filename}:${this.linenr}: ` : ''}error: couldn't parse '${this._line.trim()}': ${msg}`,
    );
  }

  _trailing_tokens_error(): void {
    this._parse_error('extra tokens at end of line');
  }

  /**
   * Prints warnings for all references to undefined symbols within the
   * Kconfig files.
   */
  _check_undef_syms(): void {
    const is_num = (s: string): boolean => {
      // Returns True if the string 's' looks like a number.
      //
      // Internally, all operands in Kconfig are symbols, only undefined symbols
      // (which numbers usually are) get their name as their value.
      //
      // Only hex numbers that start with 0x/0X are classified as numbers.
      // Otherwise, symbols whose names happen to contain only the letters A-F
      // would trigger false positives.

      if (!isNaN(Number(s))) {
        return true;
      }
      if (!s.startsWith('0x') && !s.startsWith('0X')) {
        return false;
      }
      return !isNaN(Number.parseInt(s, 16));
    };

    for (const sym of Object.values(this.syms)) {
      // - sym.nodes empty means the symbol is undefined (has no
      //   definition locations)
      //
      // - Due to Kconfig internals, numbers show up as undefined Kconfig
      //   symbols, but shouldn't be flagged
      if (!sym.nodes.length && !is_num(sym.name)) {
        let msg = `undefined symbol ${sym.name}:`;
        for (const node of this.node_iter()) {
          if (node.referenced.has(sym)) {
            msg += `\n\n- Referenced at ${node.filename}:${node.linenr}:\n\n${node}`;
          }
        }
        this._warn(msg);
      }
    }
  }

  /**
   * Prints a warning message if warnings are enabled.
   * @param msg - The warning message to print.
   * @param filename - The filename associated with the warning (optional).
   * @param linenr - The line number associated with the warning (optional).
   */
  _warn(msg: string, filename: string | null = null, linenr: number | null = null) {
    // For printing general warnings

    if (!this.warn) {
      return;
    }

    let warningMsg = 'warning: ' + msg;
    if (filename !== null && linenr !== null) {
      warningMsg = `${filename}:${linenr}: ${warningMsg}`;
    }

    this.warnings.push(warningMsg);
    if (this.warn_to_stderr) {
      process.stderr.write(warningMsg + '\n');
    }
  }

  /**
   * Prints an informational message if info is enabled.
   * @param msg - The informational message to print.
   */
  _info(msg: string) {
    if (!this.info) {
      return;
    }

    process.stderr.write(`info: ${msg}\n`);
  }
}

/**
 * Represents a configuration symbol:
 *
 * ```
 *   (menu)config FOO
 *      ...
 *
 * ```
 *
 * Note: Prompts, help texts, and locations are stored in the Sym's
 * MenuNode(s) rather than in the Sym itself. Check the {@link MenuNode} class and
 * the {@link Sym.nodes} attribute. This organization matches the C tools.
 */
export class Sym {
  /**
   * The user value of the symbol. None if no user value has been assigned
   * (via Kconfig.load_config() or Sym.set_value()).
   * Holds 0 or 2 for bool symbols, and a string for the other
   * symbol types.
   * WARNING: Do not assign directly to this. It will break things. Use
   * Sym.set_value().
   */
  _user_value: TKconfigSymbolValue | null;

  /**
   * Internal attributes
   */
  _cached_str_val: string | null;

  /**
   * Internal attributes
   */
  _cached_bool_val: number | null;

  /**
   * Internal attributes
   */

  _cached_vis: number | null;

  /**
   * Internal attributes
   */
  _cached_assignable: number[] | null;

  /**
   * _visited is used during tree iteration and dep. loop detection
   */
  _visited: any | null;

  /**
   * _write_to_conf is calculated along with the value. If True, the
   * Sym gets a.config entry.
   */
  _write_to_conf: boolean;

  /**
   * _was_set is set to True when the symbol is set to a value.
   */
  _was_set: boolean;

  /**
   * The Kconfig object that this choice belongs to.
   */
  readonly kconfig: Kconfig;

  /**
   * The name of the symbol. such as `FOO`.
   */
  readonly name: string;

  /**
   * True if the symbol is a constant (quoted) symbol. Defaults to false.
   */
  is_constant: boolean;

  /**
   * The direct ('depends on') dependencies for the symbol, or self.kconfig.y
   * if there are no direct dependencies.
   * This attribute includes any dependencies from surrounding menus and ifs.
   * Those get propagated to the direct dependencies, and the resulting direct
   * dependencies in turn get propagated to the conditions of all properties.
   * If the symbol is defined in multiple locations, the dependencies from the
   * different locations get ORed together.
   */
  direct_dep: TKconfigSymbolDep;

  /**
   * Reverse dependency expression from other symbols selecting this symbol.
   * Multiple selections get ORed together. A condition on a select is ANDed
   * with the selecting symbol.
   * For example, if A has 'select FOO' and B has 'select FOO if C', then
   * FOO's rev_dep will be (OR, A, (AND, B, C)).
   */
  rev_dep: TKconfigSymbolDep;

  /**
   * Like rev_dep, but for imply.
   */
  weak_rev_dep: TKconfigSymbolDep;

  /**
   * The type as given in the Kconfig file, without any changes applied. Used
   * when printing the symbol.
   */
  orig_type: TKconfigType;

  /**
   * If the Sym has an 'option env="FOO"' option, this contains the name
   * ("FOO") of the environment variable. None for symbols without no
   * 'option env'.
   * 'option env="FOO"' acts like a 'default' property whose value is the
   * value of $FOO.
   * NOTE: Symbols with 'option env' are never written out to.config files, even if
   * they are visible. env_var corresponds to a flag called SYMBOL_AUTO in the
   * C implementation.
   */
  env_var: string | null;

  /**
   * A list of MenuNodes for this symbol. Will contain a single MenuNode for
   * most symbols. Undefined and constant symbols have an empty nodes list.
   * Symbols defined in multiple locations get one node for each location.
   */
  nodes: MenuNode[];

  /**
   * List of (default, cond) tuples for the symbol's 'default' properties. For
   * example, 'default A && B if C || D' is represented as
   * ((AND, A, B), (OR, C, D)). If no condition was given, 'cond' is
   * self.kconfig.y.
   * Note that 'depends on' and parent dependencies are propagated to
   * 'default' conditions.
   */
  defaults: Array<[Sym, TKconfigExpr]>;

  /**
   * List of (symbol, cond) tuples for the symbol's 'select' properties. For
   * example, 'select A if B && C' is represented as (A, (AND, B, C)). If no
   * condition was given, 'cond' is self.kconfig.y.
   * Note that 'depends on' and parent dependencies are propagated to 'select'
   * conditions.
   */
  selects: Array<[Sym, TKconfigExpr]>;

  /**
   * Same as 'selects', but for 'imply' properties.
   */
  implies: Array<[Sym, TKconfigExpr]>;

  /**
   * List of (low, high, cond) tuples for the symbol's 'range' properties. For
   * example, 'range 0 10 if A' is represented as (0, 10, A). If there is no
   * condition, 'cond' is self.kconfig.y.
   * Note that 'depends on' and parent dependencies are propagated to 'range'
   * conditions.
   * Gotcha: 0 and 10 above will be represented as (undefined) Symbols rather
   * than plain integers. Undefined symbols get their name as their string
   * value, so this works out. The C tools work the same way.
   */
  ranges: Array<[Sym, Sym, TKconfigExpr]>;

  /**
   * Holds the parent Choice for choice symbols, and None for non-choice
   * symbols. Doubles as a flag for whether a symbol is a choice symbol.
   */
  choice: Choice | null;

  /**
   * is_allnoconfig_y:
   * True if the symbol has 'option allnoconfig_y' set on it. This has no
   * effect internally (except when printing symbols), but can be checked by
   * scripts.
   * TODO Do we use this?
   */
  is_allnoconfig_y: boolean;

  /**
   * See Kconfig._build_dep()
   */
  _dependents: Set<Sym | Choice>;

  parent: MenuNode | null = null;
  next: MenuNode | null = null;
  prompt: TKconfigPrompt | null = null;
  item: Sym | Choice | number | null = null;
  is_menuconfig: boolean = false;
  help: string | null = null;

  /**
   * Sym constructor -- not intended to be called directly by Kconfiglib
   * clients.
   * @param options Sym constructor options.
   */
  constructor(options: {
    /**
     * The Kconfig instance related to this symbol.
     */
    kconfig: Kconfig;

    /**
     * The name of the symbol.
     */
    name: string;

    /**
     * True if the symbol is a constant (quoted) symbol. Defaults to false.
     */
    is_constant?: boolean;
  }) {
    const { kconfig, name, is_constant = false } = options;
    this.kconfig = kconfig;
    this.name = name;
    this.is_constant = is_constant;
    this.direct_dep = this.kconfig.n;
    this.rev_dep = this.kconfig.n;
    this.weak_rev_dep = this.kconfig.n;
    this.orig_type = UNKNOWN;
    this.env_var = null;
    this.nodes = [];
    this.defaults = [];
    this.selects = [];
    this.implies = [];
    this.ranges = [];
    this.choice = null;
    this._user_value = null;
    this._cached_str_val = null;
    this._cached_bool_val = null;
    this._cached_vis = null;
    this._cached_assignable = null;
    this._visited = UNKNOWN;
    this._write_to_conf = false;
    this.is_allnoconfig_y = false;
    this._was_set = false;
    this._dependents = new Set();
  }

  /**
   * The type of the symbol. One of BOOL, STRING, INT, HEX, UNKNOWN.
   * UNKNOWN is for undefined symbols, (non-special) constant symbols, and
   * symbols defined without a type.
   */
  get type() {
    return this.orig_type;
  }

  /**
   * The value of the symbol as a string. Gives the value for string/int/hex
   * symbols. For bool symbols, gives "n" or "y".
   * This is the symbol value that's used in relational expressions
   * (A = B, A!= B, etc.)
   * Gotcha: For int/hex symbols, the exact format of the value is often
   * preserved (e.g. when writing a.config file), hence why you can't get it
   * directly as an int. Do int(int_sym.str_value) or
   * int(hex_sym.str_value, 16) to get the integer value.
   */
  get str_value(): string {
    if (this._cached_str_val !== null) {
      return this._cached_str_val;
    }

    if (this.orig_type === BOOL) {
      // Also calculates the visibility, so invalidation safe
      this._cached_str_val = BOOL_TO_STR[this.bool_value];
      return this._cached_str_val;
    }

    // As a quirk of Kconfig, undefined symbols get their name as their
    // string value. This is why things like "FOO = bar" work for seeing if
    // FOO has the value "bar".
    if (!this.orig_type) {
      this._cached_str_val = this.name;
      return this.name;
    }

    let val = '';
    // Warning: TODO See Sym._rec_invalidate(), and note that this is a hidden
    // function call (property magic)
    const vis = this.visibility;
    this._write_to_conf = vis !== 0;
    let low = 0;
    let high = 0;
    if (_INT_HEX.includes(this.orig_type)) {
      // The C implementation checks the user value against the range in a
      // separate code path (post-processing after loading a.config).
      // Checking all values here instead makes more sense for us. It
      // requires that we check for a range first.
      const base = _TYPE_TO_BASE[this.orig_type];

      // Check if a range is in effect
      let has_active_range = false;
      for (const [low_expr, high_expr, cond] of this.ranges) {
        if (expr_value(cond)) {
          has_active_range = true;
          // The zeros are from the C implementation running strtoll()
          // on empty strings
          low = _is_base_n(low_expr.str_value, base) ? parseInt(low_expr.str_value, base) : 0;
          high = _is_base_n(high_expr.str_value, base) ? parseInt(high_expr.str_value, base) : 0;
          break;
        }
      }

      // Defaults are used if the symbol is invisible, lacks a user value,
      // or has an out-of-range user value
      let use_defaults = true;
      if (vis && this._user_value) {
        const user_val = parseInt(String(this._user_value), base);
        if (has_active_range && !(low <= user_val && user_val <= high)) {
          const num2str = base === 10 ? String : hex;
          this.kconfig._warn(
            `user value ${num2str(user_val)} on the ${TYPE_TO_STR[this.orig_type]} symbol ${this.name_and_loc} ignored due to ` +
              `being outside the active range ([$${num2str(low)}, $${num2str(high)}]) -- falling back on defaults`,
          );
        } else {
          // If the user value is well-formed and satisfies range
          // constraints, it is stored in exactly the same form as
          // specified in the assignment (with or without "0x", etc.)
          val = String(this._user_value);
          use_defaults = false;
        }
      }

      if (use_defaults) {
        // No user value or invalid user value. Look at defaults.

        // Used to implement the warning below
        let has_default = false;
        let val_num = 0;
        for (const [sym, cond] of this.defaults) {
          if (expr_value(cond)) {
            has_default = this._write_to_conf = true;
            val = sym.str_value;
            if (_is_base_n(val, base)) {
              val_num = parseInt(val, base);
            } else {
              // strtoll() on empty string
              val_num = 0;
            }

            break;
          }
        }

        // This clamping procedure runs even if there's no default
        if (has_active_range) {
          let clamp = null;
          if (val_num < low) {
            clamp = low;
          } else if (val_num > high) {
            clamp = high;
          }

          if (clamp !== null) {
            // The value is rewritten to a standard form if it is
            // clamped
            val = base === 10 ? String(clamp) : hex(clamp);

            if (has_default) {
              const num2str = base === 10 ? String : hex;
              this.kconfig._warn(
                `default value ${val_num} on ${this.name_and_loc} clamped to ${num2str(clamp)} due to ` +
                  `being outside the active range ([$${num2str(low)}, $${num2str(high)}])`,
              );
            }
          }
        }
      }
    } else if (this.orig_type === STRING) {
      if (vis && this._user_value !== null) {
        // If the symbol is visible and has a user value, use that
        val = String(this._user_value);
      } else {
        // Otherwise, look at defaults
        for (const [sym, cond] of this.defaults) {
          if (expr_value(cond)) {
            val = sym.str_value;
            this._write_to_conf = true;
            break;
          }
        }
      }
    }

    // env_var corresponds to SYMBOL_AUTO in the C implementation, and is
    // also set on the defconfig_list symbol there. Test for the
    // defconfig_list symbol explicitly instead here, to avoid a nonsensical
    // env_var setting and the defconfig_list symbol being printed
    // incorrectly. This code is pretty cold anyway.
    if (this.env_var !== null || this === this.kconfig.defconfig_list) {
      this._write_to_conf = false;
    }

    this._cached_str_val = val;
    return val;
  }

  /**
   * See the class documentation.
   */
  get bool_value(): number {
    if (this._cached_bool_val !== null) {
      return this._cached_bool_val;
    }

    if (this.orig_type !== BOOL) {
      // always n for non-bool symbols
      if (this.orig_type) {
        // Would take some work to give the location here
        this.kconfig._warn(
          `The ${TYPE_TO_STR[this.orig_type]} symbol ${this.name_and_loc} is being evaluated in a logical context ` +
            'somewhere. It will always evaluate to n.',
        );
      }

      this._cached_bool_val = 0;
      return 0;
    }

    // Warning: See Sym._rec_invalidate(), and note that this is a hidden
    // function call (property magic)
    const vis = this.visibility;
    this._write_to_conf = vis !== 0;

    let val = 0;

    if (!this.choice) {
      // Non-choice symbol

      if (vis && this._user_value !== null) {
        // If the symbol is visible and has a user value, use that
        val = Math.min(parseInt(String(this._user_value)), vis);
      } else {
        // Otherwise, look at defaults and weak reverse dependencies
        // (implies)

        for (const [defaultValue, cond] of this.defaults) {
          const dep_val = expr_value(cond);
          if (dep_val) {
            val = Math.min(expr_value(defaultValue), dep_val);
            if (val) {
              this._write_to_conf = true;
            }
            break;
          }
        }

        // Weak reverse dependencies are only considered if our
        // direct dependencies are met
        const dep_val = expr_value(this.weak_rev_dep);
        if (dep_val && expr_value(this.direct_dep)) {
          val = Math.max(dep_val, val);
          this._write_to_conf = true;
        }
      }

      // Reverse (select-related) dependencies take precedence
      const dep_val = expr_value(this.rev_dep);
      if (dep_val) {
        if (expr_value(this.direct_dep) < dep_val) {
          this._warn_select_unsatisfied_deps();
        }

        val = Math.max(dep_val, val);
        this._write_to_conf = true;
      }

      if (val === 1) {
        throw new Error(
          `Value of symbol ${this.name} of type ${TYPE_TO_STR[this.type]} is 1, ` +
            'which is not a valid bool value in kconfiglib (choose 0 for n or 2 for y).',
        );
      }
    } else if (vis === 2) {
      // Visible choice symbol in y-mode choice. The choice mode limits
      // the visibility of choice symbols, so it's sufficient to just
      // check the visibility of the choice symbols themselves.
      val = this.choice.selection === this ? 2 : 0;
    } else if (vis && this._user_value) {
      val = 2;
    }

    this._cached_bool_val = val;
    return val;
  }

  /**
   * A tuple containing the bool user values that can currently be
   * assigned to the symbol (that would be respected), ordered from lowest (0,
   * representing n) to highest (2, representing y). This corresponds to the
   * selections available in the menuconfig interface. The set of assignable
   * values is calculated from the symbol's visibility and selects/implies.
   *
   * Returns the empty set for non-bool symbols and for symbols with
   * visibility n. The other possible values are (0, 2) and (2,). A (2,) result means
   * the symbol is visible but "locked" to y through a select, perhaps in combination with the
   * visibility. menuconfig represents this as and -*-.
   *
   * For string/hex/int symbols, check if Sym.visibility is non-0 (non-n)
   * instead to determine if the value can be changed.
   *
   * Some handy 'assignable' idioms:
   *
   *     # Is 'sym' an assignable (visible) bool symbol?
   *     if (sym.assignable) {
   *         // What's the highest value it can be assigned? [-1] in Python
   *         // gives the last element.
   *         const sym_high = sym.assignable[sym.assignable.length - 1];
   *
   *         // The lowest?
   *         const sym_low = sym.assignable[0];
   *
   *         // Can the symbol be set to y?
   *         if (sym.assignable[sym.assignable.length - 1] === 2) {
   *            ...
   *         }
   *     }
   */
  get assignable(): number[] {
    if (this._cached_assignable === null) {
      this._cached_assignable = this._assignable();
    }
    return this._cached_assignable;
  }

  /**
   * The visibility of the symbol. One of 0, 2, representing n, y. See
   * the module documentation for an overview of symbol values and visibility.
   */
  get visibility(): number {
    if (this._cached_vis === null) {
      this._cached_vis = _visibility(this);
    }
    return this._cached_vis;
  }

  /**
   * The.config assignment string that would get written out for the symbol
   * by Kconfig.write_config(). Returns the empty string if no.config
   * assignment would get written out.
   *
   * In general, visible symbols, symbols with (active) defaults, and selected
   * symbols get written out. This includes all non-n-valued bool
   * symbols, and all visible string/int/hex symbols.
   *
   * Symbols with the (no longer needed) 'option env=...' option generate no
   * configuration output, and neither does the special
   * 'option defconfig_list' symbol.
   *
   * Tip: This field is useful when generating custom configuration output,
   * even for non-.config-like formats. To write just the symbols that would
   * get written out to.config files, do this:
   *
   *     if (sym.config_string) {
   *         *Write symbol, e.g. by looking sym.str_value*
   *     }
   *
   * This is a superset of the symbols written out by write_autoconf().
   * That function skips all n-valued symbols.
   *
   * There usually won't be any great harm in just writing all symbols either,
   * though you might get some special symbols and possibly some "redundant"
   * n-valued symbol entries in there.
   */
  get config_string(): string {
    // _write_to_conf is determined when the value is calculated. This is a
    // hidden function call due to property magic.
    const val = this.str_value;
    if (!this._write_to_conf) {
      return '';
    }

    if (this.orig_type === BOOL) {
      return val !== 'n'
        ? `${this.kconfig.config_prefix}${this.name}=${val}\n`
        : `# ${this.kconfig.config_prefix}${this.name} is not set\n`;
    }

    if (_INT_HEX.includes(this.orig_type)) {
      return `${this.kconfig.config_prefix}${this.name}=${val}\n`;
    }

    // sym.orig_type == STRING
    return `${this.kconfig.config_prefix}${this.name}="${escape(val)}"\n`;
  }

  /**
   * Holds a string like
   *
   * "MY_SYMBOL (defined at foo/Kconfig:12, bar/Kconfig:14)"
   *
   *, giving the name of the symbol and its definition location(s).
   * If the symbol is undefined, the location is given as "(undefined)".
   */
  get name_and_loc(): string {
    return this.name + ' ' + _locs(this);
  }

  /**
   * Sets the user value of the symbol.
   *
   * Equal in effect to assigning the value to the symbol within a.config
   * file. For bool symbols, use the 'assignable' attribute to
   * check which values can currently be assigned. Setting values outside
   * 'assignable' will cause Sym._user_value to differ from
   * Sym.str/bool_value (be truncated down or up).
   *
   * Setting a choice symbol to 2 (y) sets Choice._user_selection to the
   * choice symbol in addition to setting Sym._user_value.
   * Choice._user_selection is considered when the choice is in y mode (the
   * "normal" mode).
   *
   * Other symbols that depend (possibly indirectly) on this symbol are
   * automatically recalculated to reflect the assigned value.
   *
   * value:
   *   The user value to give to the symbol. For bool symbols,
   *   n/y can be specified either as 0/2 (the usual format for
   *   values in Kconfiglib) or as one of the strings "n", "y". For
   *   other symbol types, pass a string.
   *
   *   Note that the value for an int/hex symbol is passed as a string, e.g.
   *   "123" or "0x0123". The format of this string is preserved in the
   *   output.
   *
   *   Values that are invalid for the type (such as "foo" for a
   *   BOOL or "0x123" for an INT) are ignored and won't be stored in
   *   Sym._user_value. Kconfiglib will print a warning by default for
   *   invalid assignments, and set_value() will return False.
   *
   * Returns True if the value is valid for the type of the symbol, and
   * False otherwise. This only looks at the form of the value. For BOOL
   * symbols, check the Sym.assignable attribute to see what values are
   * currently in range and would actually be reflected in the value
   * of the symbol. For other symbol types, check whether the visibility is non-n.
   */
  set_value(value: any): boolean {
    if (this.orig_type === BOOL && value in STR_TO_BOOL) {
      value = STR_TO_BOOL[value];
    }

    // If the new user value matches the old, nothing changes, and we can
    // avoid invalidating cached values.
    //
    // This optimization is skipped for choice symbols: Setting a choice
    // symbol's user value to y might change the state of the choice, so it
    // wouldn't be safe (symbol user values always match the values set in a
    //.config file or via set_value(), and are never implicitly updated).
    if (value === this._user_value && !this.choice) {
      this._was_set = true;
      return true;
    }

    // Check if the value is valid for our type
    if (
      !(
        (this.orig_type === BOOL && [2, 0].includes(value)) ||
        (typeof value === 'string' &&
          (this.orig_type === STRING ||
            (this.orig_type === INT && _is_base_n(value, 10)) ||
            (this.orig_type === HEX && _is_base_n(value, 16) && parseInt(value, 16) >= 0)))
      )
    ) {
      // Display bool values as n, y in the warning
      this.kconfig._warn(
        `the value ${BOOL_TO_STR[value] || `'${value}'`} is invalid for ${this.name_and_loc}, which has type ${TYPE_TO_STR[this.orig_type]} -- assignment ignored`,
      );
      return false;
    }

    this._user_value = value;
    this._was_set = true;

    if (this.choice && value === 2) {
      // Setting a choice symbol to y makes it the user selection of the
      // choice. Like for symbol user values, the user selection is not
      // guaranteed to match the actual selection of the choice, as
      // dependencies come into play.
      this.choice._user_selection = this;
      this.choice._was_set = true;
      this.choice._rec_invalidate();
    } else {
      this._rec_invalidate_if_has_prompt();
    }

    return true;
  }

  /**
   * Removes any user value from the symbol, as if the symbol had never
   * gotten a user value via Kconfig.load_config() or Sym.set_value().
   */
  unset_value() {
    if (this._user_value !== null) {
      this._user_value = null;
      this._rec_invalidate_if_has_prompt();
    }
  }

  /**
   * A set with all symbols and choices referenced in the properties and
   * property conditions of the symbol.
   *
   * Also includes dependencies from surrounding menus and ifs, because those
   * get propagated to the symbol (see the 'Intro to symbol values' section in
   * the module docstring).
   *
   * Choices appear in the dependencies of choice symbols.
   *
   * For the following definitions, only B and not C appears in A's
   * 'referenced'. To get transitive references, you'll have to recursively
   * expand 'references' until no new items appear.
   *
   *     config A
   *             bool
   *             depends on B
   *
   *     config B
   *             bool
   *             depends on C
   *
   *     config C
   *             bool
   *
   * See the Sym.direct_dep attribute if you're only interested in the
   * direct dependencies of the symbol (its 'depends on'). You can extract the
   * symbols in it with the global expr_items() function.
   */
  get referenced(): Set<any> {
    return new Set([...this.nodes].flatMap((node) => [...node.referenced]));
  }

  /**
   * Returns a list of all orig_defaults from all menunodes this symbol is part of.
   * See Menunode orig_* for more information.
   */
  get orig_defaults() {
    return this.nodes.flatMap((node) => node.orig_defaults);
  }

  /**
   * Returns a list of all orig_selects from all menunodes this symbol is part of.
   * See Menunode orig_* for more information.
   */
  get orig_selects(): any[] {
    return this.nodes.flatMap((node) => node.orig_selects);
  }

  /**
   * Returns a list of all orig_implies from all menunodes this symbol is part of.
   * See Menunode orig_* for more information.
   */
  get orig_implies(): any[] {
    return this.nodes.flatMap((node) => node.orig_implies);
  }

  /**
   * Returns a list of all orig_ranges from all menunodes this symbol is part of.
   * See Menunode orig_* for more information.
   */
  get orig_ranges(): any[] {
    return this.nodes.flatMap((node) => node.orig_ranges);
  }

  /**
   * Returns a string with information about the symbol (including its name,
   * value, visibility, and location(s)) when it is evaluated on e.g. the
   * interactive Python prompt.
   */
  toString() {
    return this.custom_str(standard_sc_expr_str);
    // const fields: string[] = [`symbol ${this.name}`, TYPE_TO_STR[this.type]];

    // // Add prompt for each node
    // for (const node of this.nodes) {
    //   if (node.prompt) {
    //     fields.push(`"${node.prompt[0]}"`);
    //   }
    // }

    // // Add value (quotes for non-bool symbols)
    // fields.push(`value ${this.orig_type === BOOL ? this.str_value : `"${this.str_value}"`}`);

    // if (!this.is_constant) {
    //   // These aren't helpful to show for constant symbols
    //   if (this._user_value !== null) {
    //     fields.push(
    //       `user value ${this.orig_type === BOOL ? BOOL_TO_STR[this._user_value as number] : `"${this._user_value}"`}`,
    //     );
    //   }

    //   fields.push(`visibility ${BOOL_TO_STR[this.visibility]}`);

    //   if (this.choice) {
    //     fields.push('choice symbol');
    //   }

    //   if (this.is_allnoconfig_y) {
    //     fields.push('allnoconfig_y');
    //   }

    //   if (this === this.kconfig.defconfig_list) {
    //     fields.push('is the defconfig_list symbol');
    //   }

    //   if (this.env_var !== null) {
    //     fields.push(`from environment variable ${this.env_var}`);
    //   }

    //   fields.push(`direct deps ${BOOL_TO_STR[expr_value(this.direct_dep)]}`);
    // }

    // // Add filenames and line numbers
    // if (this.nodes.length > 0) {
    //   for (const node of this.nodes) {
    //     fields.push(`${node.filename}:${node.linenr}`);
    //   }
    // } else {
    //   fields.push(this.is_constant ? 'constant' : 'undefined');
    // }

    // return `<${fields.join(', ')}>`;
  }

  /**
   * Works like Sym.__str__(), but allows a custom format to be used for
   * all symbol/choice references. See expr_str().
   * @param sc_expr_str_fn - The function to use for formatting symbol/choice references.
   */
  custom_str(sc_expr_str_fn: any) {
    return this.nodes.map((node) => node.custom_str(sc_expr_str_fn)).join('\n\n');
  }

  /**
   * Worker function for the 'assignable' attribute.
   */
  _assignable() {
    if (this.orig_type !== BOOL) {
      return [];
    }

    const vis = this.visibility;
    if (!vis) {
      return [];
    }

    const rev_dep_val = expr_value(this.rev_dep);

    if (vis === 2) {
      if (this.choice) {
        return [2];
      }
      if (!rev_dep_val) {
        return [0, 2];
      }
      if (rev_dep_val === 2) {
        return [2];
      }
      return [2];
    }

    if (!rev_dep_val) {
      return expr_value(this.weak_rev_dep) !== 2 ? [] : [0, 2];
    }

    if (rev_dep_val === 2) {
      return [2];
    }

    return [2];
  }

  /**
   * Marks the symbol as needing to be recalculated.
   */
  _invalidate() {
    this._cached_str_val = this._cached_bool_val = this._cached_vis = this._cached_assignable = null;
  }

  /**
   * Invalidates the symbol and all items that (possibly) depend on it.
   */
  _rec_invalidate() {
    this._invalidate();
    for (const item of this._dependents) {
      if (item._cached_vis !== null) {
        item._rec_invalidate();
      }
    }
  }

  /**
   * Invalidates the symbol and its dependent symbols, but only if the
   * symbol has a prompt. User values never have an effect on promptless
   * symbols, so we skip invalidation for them as an optimization.
   * This also prevents constant (quoted) symbols from being invalidated
   * if set_value() is called on them, which would make them lose their
   * value and break things.
   * Prints a warning if the symbol has no prompt. In some contexts (e.g.
   * when loading a.config files) assignments to promptless symbols are
   * normal and expected, so the warning can be disabled.
   */
  _rec_invalidate_if_has_prompt() {
    for (const node of this.nodes) {
      if (node.prompt) {
        this._rec_invalidate();
        return;
      }
    }
    if (this.kconfig._warn_assign_no_prompt) {
      this.kconfig._warn(this.name_and_loc + ' has no prompt, meaning user values have no effect on it');
    }
  }

  /**
   * write_min_config() helper function. Returns the value the symbol
   * would get from defaults if it didn't have a user value. Uses exactly
   * the same algorithm as the C implementation (though a bit cleaned up),
   * for compatibility.
   */
  _str_default() {
    if (this.orig_type === BOOL) {
      let val = 0;
      if (!this.choice) {
        for (const [defaultValue, cond] of this.defaults) {
          const cond_val = expr_value(cond);
          if (cond_val) {
            val = Math.min(expr_value(defaultValue), cond_val);
            break;
          }
        }
        val = Math.max(expr_value(this.rev_dep), expr_value(this.weak_rev_dep), val);
      }
      return BOOL_TO_STR[val];
    }

    if (this.orig_type) {
      // STRING/INT/HEX
      for (const [defaultValue, cond] of this.defaults) {
        if (expr_value(cond)) {
          return defaultValue.str_value;
        }
      }
    }

    return '';
  }

  /**
   * Helper for printing an informative warning when a symbol with
   * unsatisfied direct dependencies (dependencies from 'depends on', ifs,
   * and menus) is selected by some other symbol.
   */
  _warn_select_unsatisfied_deps() {
    let msg =
      `${this.name_and_loc} has direct dependencies ${expr_str(this.direct_dep)} with value ${BOOL_TO_STR[expr_value(this.direct_dep)]}, but is ` +
      `${BOOL_TO_STR[expr_value(this.rev_dep)]}-selected by the following symbols:`;

    for (const select of split_expr(this.rev_dep, OR)) {
      if (expr_value(select) <= expr_value(this.direct_dep)) {
        continue;
      }

      const selecting_sym = split_expr(select, AND)[0];
      msg += `\n - ${selecting_sym.name_and_loc}, with value ${selecting_sym.str_value}, direct dependencies ${expr_str(selecting_sym.direct_dep)} (value: ${BOOL_TO_STR[expr_value(selecting_sym.direct_dep)]})`;

      if (select instanceof Array) {
        msg += `, and select condition ${expr_str(select[2])} (value: ${BOOL_TO_STR[expr_value(select[2])]})`;
      }
    }

    this.kconfig._warn(msg);
  }
}

/**
 * Represents a choice statement:
 *
 * ```
 *    choice
 *        ...
 *    endchoice
 * ```
 *
 * Note: Prompts, help texts, and locations are stored in the Choice's
 * MenuNode(s) rather than in the Choice itself. Check the MenuNode class and
 * the Choice.nodes attribute. This organization matches the C tools.
 */
export class Choice {
  /**
   * Represents the value (mode) that has been selected by the user through the
   * Choice.set_value() method. It can be either 0 or 2, or it will be set to
   * null if the user hasn't selected a mode yet. Refer to Sym._user_value
   * for more details.
   *
   * WARNING: Do not directly assign a value to this property. Doing so will
   * cause issues and break the functionality. Instead, use the Choice.set_value()
   * method to update the value.
   */
  _user_value: number | null = null;

  /**
   * Represents the symbol that has been selected by the user (by setting it to 'y').
   * If the choice is not in the 'y' mode, this value is ignored. However, it is still
   * remembered so that if the mode is changed back to 'y', the choice will "snap
   * back" to the user's previous selection. It's important to note that this might
   * differ from the 'selection' property due to unsatisfied dependencies.
   *
   * WARNING: Do not directly assign a value to this property. Doing so will
   * disrupt the functionality and cause issues. Instead, call sym.set_value(2) on
   * the choice symbol that you want to select.
   */
  _user_selection: any | null = null;

  /**
   * An internal attribute. Its value represents some internal state, which is set
   * to UNKNOWN initially. The specific meaning and usage of this value are likely
   * related to internal logic within the class or related functionality.
   */
  _visited: any = UNKNOWN;

  /**
   * An internal attribute. It serves as a cache for some visual or related state.
   * The initial value is set to null, and its specific role and how it's used are
   * part of the internal implementation details.
   */
  _cached_vis: any | null = null;

  /**
   * An internal attribute. It likely plays a role in caching information related
   * to whether something is assignable. Its specific functionality and usage are
   * determined by the internal logic of the class or related operations.
   */
  _cached_assignable: any | null = null;

  /**
   * An internal attribute. It is used to cache selection-related information.
   * Initially, it is set to _T_NO_CACHED_SELECTION, and its value changes based on
   * specific operations and internal logic within the context of the class.
   */
  _cached_selection: any = _T_NO_CACHED_SELECTION;

  /**
   * An internal attribute used to store a set of dependents. The specific elements
   * in the set and how they are managed are part of the internal implementation.
   * The type is set to a Set, and the 'type: ignore' comment might be used if there
   * are some type-related issues that need to be bypassed in the current context.
   */
  _dependents: Set<any> = new Set();

  /**
   * An internal attribute. It is used to track whether the choice has been set
   * explicitly by the user. If it is set to true, it means the choice has been
   * explicitly set by the user. If it is set to false, it means the choice has
   * not been explicitly set by the user. The initial value is set to false.
   */
  _was_set: boolean = false;

  /**
   * The Kconfig object that this choice belongs to.
   */
  kconfig: Kconfig;

  /**
   * The name of the symbol. such as `FOO`.
   */
  name?: string;

  /**
   * The type as given in the Kconfig file, without any changes applied. Used
   * when printing the choice.
   */
  direct_dep?: Sym;

  /**
   * The type as given in the Kconfig file, without any changes applied. Used
   * when printing the choice.
   */
  orig_type: TKconfigType = UNKNOWN;

  /**
   * A list of MenuNodes for this choice. In practice, the list will probably
   * always contain a single MenuNode, but it is possible to give a choice a
   * name and define it in multiple locations.
   */
  nodes: MenuNode[] = [];

  /**
   * List of symbols contained in the choice.
   *
   * Obscure gotcha: If a symbol depends on the previous symbol within a
   * choice so that an implicit menu is created, it won't be a choice symbol,
   * and won't be included in 'syms'.
   */
  syms: Sym[] = [];

  /**
   * An array of tuples, where each tuple contains a symbol and a condition.
   * It represents the 'defaults' properties for the choice. For example,
   * a statement like 'default A if B && C' would be represented as an array
   * element in the form of (A, (AND, B, C)). In case there is no condition,
   * the 'cond' part of the tuple is set to self.kconfig.y.
   *
   * It should be noted that 'depends on' and parent dependencies are
   * propagated to the 'default' conditions.
   */
  defaults: Array<[Sym, TKconfigExpr]> = [];

  /**
   * This property indicates whether something is constant. It is set to false
   * initially. It is checked by the _depend_on() method (presumably part of the
   * internal logic). Setting it here helps avoid having to handle choices in a
   * special way in related operations.
   */
  is_constant: boolean = false;

  /**
   * Constructs a new Choice object.
   *
   * @param options - An object containing the following properties:
   *   - kconfig: The Kconfig object that this choice belongs to.
   *   - name: The name of the symbol. such as `FOO`.
   *   - direct_dep: The type as given in the Kconfig file, without any changes applied. Used
   *     when printing thechoice.
   */
  constructor(options: {
    /**
     * The Kconfig object that this choice belongs to.
     */
    kconfig: Kconfig;

    /**
     * The name of the symbol. such as `FOO`.
     */
    name?: string;

    /**
     * The type as given in the Kconfig file, without any changes applied. Used
     * when printing the choice.
     */
    direct_dep?: Sym;
  }) {
    this.kconfig = options.kconfig;
    this.name = options.name;
    this.direct_dep = options.direct_dep;
  }

  /**
   * The type of the choice. One of BOOL, UNKNOWN. UNKNOWN is for
   * choices defined without a type where none of the contained symbols have a
   * type either (otherwise the choice inherits the type of the first symbol
   * defined with a type).
   */
  get type(): any {
    return this.orig_type;
  }

  /**
   * Like choice.bool_value, but gives the value as one of the strings
   * "n", or "y"
   */
  get str_value(): string {
    return BOOL_TO_STR[this.bool_value];
  }

  /**
   * The bool value (mode) of the choice. A choice can be in one of two
   * modes:
   *
   *     0 (n) - The choice is disabled and no symbols can be selected. For
   *             visible choices, this mode is only possible for choices with
   *             the 'optional' flag set (see kconfig-language.txt).
   *
   *     2 (y) - One symbol will be y, the rest n.
   *
   * The visibility of the choice is an upper bound on the mode, and the mode in
   * turn is an upper bound on the visibility of the choice symbols.
   *
   * To change the mode, use Choice.set_value().
   *
   * Implementation note:
   *
   * The C tools internally represent choices as a type of symbol, with
   * special-casing in many code paths. This is why there is a lot of
   * similarity to Sym.
   *
   * Symbols within choices get the choice propagated as a dependency to
   * their properties. This turns the mode of the choice into an upper bound
   * on e.g. the visibility of choice symbols, and explains the gotcha
   * related to printing choice symbols mentioned in the module docstring.
   *
   * Kconfiglib uses a separate Choice class only because it makes the code
   * and interface less confusing (especially in a user-facing interface).
   * Corresponding attributes have the same name in the Sym and Choice
   * classes, for consistency and compatibility.
   */
  get bool_value(): number {
    let val: number = 2;
    if (this._user_value !== null) {
      val = Math.max(val, this._user_value);
    }
    // Warning: See Sym._rec_invalidate(), and note that this is a hidden
    // function call (property magic)
    val = Math.min(val, this.visibility);
    return val;
  }

  /**
   * A tuple containing the bool user values that can currently be
   * assigned to the choice (that would be respected), ordered from lowest (0,
   * representing n) to highest (2, representing y). This corresponds to the
   * selections available in the menuconfig interface. The set of assignable
   * values is calculated from the choice's visibility and selects/implies.
   *
   * Returns the empty set for non-bool choice and for choice with
   * visibility n. The other possible values are (0, 2) and (2,). A (2,) result means
   * the choice is visible but "locked" to y through a select, perhaps in combination with the
   * visibility. menuconfig represents this as -*-.
   */
  get assignable(): any {
    if (this._cached_assignable === null) {
      this._cached_assignable = this._assignable();
    }
    return this._cached_assignable;
  }

  /**
   * The visibility of the choice. One of 0, 2, representing n, y. See
   * the module documentation for an overview of symbol values and visibility.
   */
  get visibility(): any {
    if (this._cached_vis === null) {
      this._cached_vis = _visibility(this);
    }
    return this._cached_vis;
  }

  /**
   * Holds a string like
   *
   *     "<choice MY_CHOICE> (defined at foo/Kconfig:12)"
   *
   *, giving the name of the choice and its definition location(s). If the
   * choice has no name (isn't defined with 'choice MY_CHOICE'), then it will
   * be shown as "<choice>" before the list of locations (always a single one
   * in that case).
   */
  get name_and_loc(): string {
    // Reuse the expression format, which is '<choice (name, if any)>'.
    return standard_sc_expr_str(this) + ' ' + _locs(this);
  }

  /**
   * The Sym instance of the currently selected symbol. None if the Choice
   * is not in y mode or has no selected symbol (due to unsatisfied
   * dependencies on choice symbols).
   *
   * WARNING: Do not assign directly to this. It will break things. Call
   * sym.set_value(2) on the choice symbol you want to select instead.
   */
  get selection(): any {
    if (this._cached_selection === _T_NO_CACHED_SELECTION) {
      this._cached_selection = this._selection();
    }
    return this._cached_selection;
  }

  /**
   * Sets the user value (mode) of the choice. Like for Sym.set_value(),
   * the visibility might truncate the value. Choices can never be in n mode,
   * but 0/"n" is still accepted since it's not a malformed value (though it
   * will have no effect).
   *
   * Returns True if the value is valid for the type of the choice, and
   * False otherwise. This only looks at the form of the value. Check the
   * Choice.assignable attribute to see what values are currently in range
   * and would actually be reflected in the mode of the choice.
   */
  set_value(value: any): boolean {
    if (value in STR_TO_BOOL) {
      value = STR_TO_BOOL[value];
    }

    if (value === this._user_value) {
      // We know the value must be valid if it was successfully set
      // previously
      this._was_set = true;
      return true;
    }

    if (!(this.orig_type === BOOL && [2, 0].includes(value))) {
      // Display bool values as n and y in the warning
      this.kconfig._warn(
        `the value ${value in BOOL_TO_STR ? BOOL_TO_STR[value] : `'${value}'`} is invalid for ${this.name_and_loc}, which has type ${TYPE_TO_STR[this.orig_type]} -- assignment ignored`,
      );
      return false;
    }

    this._user_value = value;
    this._was_set = true;
    this._rec_invalidate();
    return true;
  }

  /**
   * Resets the user value (mode) and user selection of the Choice, as if
   * the user had never touched the mode or any of the choice symbols.
   */
  unset_value(): void {
    if (this._user_value !== null || this._user_selection) {
      this._user_value = this._user_selection = null;
      this._rec_invalidate();
    }
  }

  /**
   * See the class documentation.
   */
  get referenced(): Set<any> {
    return new Set(this.nodes.flatMap((node) => node.referenced));
  }

  /**
   * See the corresponding attribute on the MenuNode class.
   */
  get orig_defaults(): any[] {
    return this.nodes.flatMap((node) => node.orig_defaults);
  }

  /**
   * Returns a string representation of the choice when it is printed.
   * Matches the Kconfig format (though without the contained choice
   * symbols), with any parent dependencies propagated to the 'depends on'
   * condition.
   *
   * The returned string does not end in a newline.
   *
   * See Sym.toString() as well.
   */
  toString(): string {
    return this.custom_str(standard_sc_expr_str);
  }

  /**
   * Works like Choice.__str__(), but allows a custom format to be used for
   * all symbol/choice references. See expr_str().
   */
  custom_str(sc_expr_str_fn: (arg: any) => string): string {
    return this.nodes.map((node) => node.custom_str(sc_expr_str_fn)).join('\n\n');
  }

  /**
   * Worker function for the 'assignable' attribute
   *
   * Warning: See Sym._rec_invalidate(), and note that this is a hidden
   * function call (property magic)
   */
  _assignable(): any[] {
    const vis = this.visibility;
    if (!vis) {
      return [];
    }
    if (vis === 2) {
      return [2];
    }
    return [];
  }

  /**
   * Worker function for the 'selection' attribute
   *
   * Warning: See Sym._rec_invalidate(), and note that this is a hidden
   * function call (property magic)
   */
  _selection(): any | null {
    if (this.bool_value !== 2) {
      // Not in y mode, so no selection
      return null;
    }

    // Use the user selection if it's visible
    if (this._user_selection && this._user_selection.visibility) {
      return this._user_selection;
    }

    // Otherwise, check if we have a default
    return this._selection_from_defaults();
  }

  /**
   * Check if we have a default
   */
  _selection_from_defaults(): any | null {
    for (const [sym, cond] of this.defaults) {
      // The default symbol must be visible too
      if (expr_value(cond) && sym.visibility) {
        return sym;
      }
    }

    // Otherwise, pick the first visible symbol, if any
    for (const sym of this.syms) {
      if (sym.visibility) {
        return sym;
      }
    }

    // Couldn't find a selection
    return null;
  }

  /**
   * Invalidate cached values
   */
  _invalidate(): void {
    this._cached_vis = this._cached_assignable = null;
    this._cached_selection = _T_NO_CACHED_SELECTION;
  }

  /**
   * See Sym._rec_invalidate()
   */
  _rec_invalidate(): void {
    this._invalidate();

    for (const item of this._dependents) {
      if (item._cached_vis !== null) {
        item._rec_invalidate();
      }
    }
  }
}

/**
 * Represents a menu node in the configuration. This corresponds to an entry
 * in, for example, the 'make menuconfig' interface, though non-visible choices,
 * menus, and comments also get menu nodes. If a symbol or choice is defined in
 * multiple locations, it gets one menu node for each location.
 *
 * The top-level menu node, corresponding to the implicit top-level menu, is
 * available in `Kconfig.top_node`.
 *
 * The menu nodes for a `Sym` or `Choice` can be found in the
 * `Sym.nodes` or `Choice.nodes` attribute. Menus and comments are represented as plain
 * menu nodes, with their text stored in the `prompt` attribute (`prompt[0]`). This mirrors the C implementation.
 *
 * The following attributes are available on `MenuNode` instances. They should
 * be viewed as read-only.
 */
export class MenuNode {
  /**
   * Properties defined on this particular menu node. A local 'depends on'
   * only applies to these, in case a symbol is defined in multiple
   * locations.
   */
  readonly kconfig: Kconfig;

  /**
   * Either a Sym, a Choice, or one of the constants MENU and COMMENT.
   * Menus and comments are represented as plain menu nodes. Ifs are collapsed
   * (matching the C implementation) and do not appear in the final menu tree.
   */
  item: TKconfigMenuNodeItem = null;

  /**
   * Set to true if the children of the menu node should be displayed in a
   * separate menu. This is the case for the following items:
   *
   *     - Menus (node.item == MENU)
   *
   *     - Choices
   *
   *     - Symbols defined with the 'menuconfig' keyword. The children come from
   *     implicitly created submenus, and should be displayed in a separate
   *     menu rather than being indented.
   *
   * 'is_menuconfig' is just a hint on how to display the menu node. It's
   * ignored internally by Kconfiglib, except when printing symbols.
   */
  is_menuconfig: boolean = false;

  /**
   * The location where the menu node appears. The filename is relative to
   * $srctree (or to the current directory if $srctree isn't set), except
   * absolute paths are used for paths outside $srctree.
   */
  filename: string | null = null;

  /**
   * line number.
   */
  linenr: number | null = null;

  /**
   * The direct ('depends on') dependencies for the menu node, or
   * self.kconfig.y if there are no direct dependencies.
   *
   * This attribute includes any dependencies from surrounding menus and ifs.
   * Those get propagated to the direct dependencies, and the resulting direct
   * dependencies in turn get propagated to the conditions of all properties.
   *
   * If a symbol or choice is defined in multiple locations, only the
   * properties defined at a particular location get the corresponding
   * MenuNode.dep dependencies propagated to them.
   */
  dep: Sym;

  /**
   * The 'visible if' dependencies for the menu node (which must represent a
   * menu), or self.kconfig.y if there are no 'visible if' dependencies.
   * 'visible if' dependencies are recursively propagated to the prompts of
   * symbols and choices within the menu.
   */
  visibility: Sym;

  /**
   * The parent menu node. null if there is no parent.
   */
  parent: MenuNode | null = null;

  /**
   * The help text for the menu node for Symbols and Choices. null if there is
   * no help text. Always stored in the node rather than the Sym or Choice.
   * It is possible to have a separate help text at each location if a symbol
   * is defined in multiple locations.
   *
   * Trailing whitespace (including a final newline) is stripped from the help
   * text. This was not the case before Kconfiglib 10.21.0, where the format
   * was undocumented.
   */
  help: string | null = null;

  /**
   * A (string, cond) tuple with the prompt for the menu node and its
   * conditional expression (which is self.kconfig.y if there is no
   * condition). null if there is no prompt.
   *
   * For symbols and choices, the prompt is stored in the MenuNode rather than
   * the Sym or Choice instance. For menus and comments, the prompt holds
   * the text.
   */
  prompt: TKconfigPrompt | null = null;

  /**
   * A tuple of (filename, linenr) tuples, giving the locations of the
   * 'source' statements via which the Kconfig file containing this menu node
   * was included. The first element is the location of the 'source' statement
   * in the top-level Kconfig file passed to Kconfig.__init__(), etc.
   *
   * Note that the Kconfig file of the menu node itself isn't included. Check
   * 'filename' and 'linenr' for that.
   * TODO Is it used anywhere both in old and new code?
   */
  include_path: [string, number][];

  /**
   * The first child menu node. null if there are no children.
   *
   * Choices and menus naturally have children, but Symbols can also have
   * children because of menus created automatically from dependencies (see
   * kconfig-language.txt). The children of a symbol are the menu nodes
   */
  list: MenuNode | null;

  /**
   * next:
   * The following menu node. null if there is no following node.
   */
  next: MenuNode | null;

  /**
   * The 'default' properties for this particular menu node. See
   * symbol.defaults.
   *
   * When evaluating defaults, you should use Sym/Choice.defaults instead,
   * as it include properties from all menu nodes (a symbol/choice can have
   * multiple definition locations/menu nodes). MenuNode.defaults is meant for
   * documentation generation.
   */
  defaults: Array<[Sym, TKconfigExpr]>;

  /**
   * Like MenuNode.defaults, for selects.
   */
  selects: Array<[Sym, TKconfigExpr]>;

  /**
   * Like MenuNode.defaults, for implies.
   */
  implies: Array<[Sym, TKconfigExpr]>;

  /**
   * Like MenuNode.defaults, for ranges.
   */
  ranges: [Sym, Sym, TKconfigExpr][];

  constructor(options: {
    kconfig: Kconfig;
    item?: TKconfigMenuNodeItem;
    is_menuconfig?: boolean;
    filename?: string | null;
    linenr?: number | null;
    dep?: Sym;
    visibility?: Sym;
    parent?: MenuNode | null;
    help?: string | null;
    prompt?: TKconfigPrompt | null;
  }) {
    const {
      kconfig,
      item = null,
      is_menuconfig = false,
      filename = null,
      linenr = null,
      dep = null,
      visibility = null,
      parent = null,
      help = null,
      prompt = null,
    } = options;

    this.kconfig = kconfig;
    this.item = item;
    this.is_menuconfig = is_menuconfig;
    this.filename = filename;
    this.linenr = linenr;
    this.dep = dep ?? kconfig.y;
    this.visibility = visibility ?? kconfig.y;
    this.include_path = kconfig._include_path;
    this.list = null;
    this.next = null;
    this.parent = parent;
    this.prompt = prompt;
    this.help = help;
    this.defaults = [];
    this.selects = [];
    this.implies = [];
    this.ranges = [];
  }

  /**
   * It works the like the corresponding attribute without orig_*, but omits
   * any dependencies propagated from 'depends on' and surrounding 'if's (the
   * direct dependencies, stored in MenuNode.dep).
   *
   * One use for this is generating less cluttered documentation, by only
   * showing the direct dependencies in one place.
   */
  get orig_prompt(): typeof this.prompt {
    if (!this.prompt) {
      return null;
    }
    return [this.prompt[0], this._strip_dep(this.prompt[1])];
  }

  /**
   * It works the like the corresponding attribute without orig_*, but omits
   * any dependencies propagated from 'depends on' and surrounding 'if's (the
   * direct dependencies, stored in MenuNode.dep).
   *
   * One use for this is generating less cluttered documentation, by only
   * showing the direct dependencies in one place.
   */
  get orig_defaults(): typeof this.defaults {
    return this.defaults.map(([defaultValue, cond]) => [defaultValue, this._strip_dep(cond)]);
  }

  /**
   * It works the like the corresponding attribute without orig_*, but omits
   * any dependencies propagated from 'depends on' and surrounding 'if's (the
   * direct dependencies, stored in MenuNode.dep).
   *
   * One use for this is generating less cluttered documentation, by only
   * showing the direct dependencies in one place.
   */
  get orig_selects(): typeof this.selects {
    return this.selects.map(([select, cond]) => [select, this._strip_dep(cond)]);
  }

  /**
   * It works the like the corresponding attribute without orig_*, but omits
   * any dependencies propagated from 'depends on' and surrounding 'if's (the
   * direct dependencies, stored in MenuNode.dep).
   *
   * One use for this is generating less cluttered documentation, by only
   * showing the direct dependencies in one place.
   */
  get orig_implies(): typeof this.implies {
    return this.implies.map(([imply, cond]) => [imply, this._strip_dep(cond)]);
  }

  /**
   * It works the like the corresponding attribute without orig_*, but omits
   * any dependencies propagated from 'depends on' and surrounding 'if's (the
   * direct dependencies, stored in MenuNode.dep).
   *
   * One use for this is generating less cluttered documentation, by only
   * showing the direct dependencies in one place.
   */
  get orig_ranges(): typeof this.ranges {
    return this.ranges.map(([low, high, cond]) => [low, high, this._strip_dep(cond)]);
  }

  /**
   * A set() with all symbols and choices referenced in the properties and
   * property conditions of the menu node.
   *
   * Also includes dependencies inherited from surrounding menus and ifs.
   * Choices appear in the dependencies of choice symbols.
   */
  get referenced(): Set<Sym | Choice> {
    // self.dep is included to catch dependencies from a lone 'depends on'
    // when there are no properties to propagate it to
    let res: Set<Sym | Choice> = expr_items(this.dep);

    if (this.prompt) {
      res = new Set([...res, ...expr_items(this.prompt[1])]);
    }

    if (this.item === MENU) {
      res = new Set([...res, ...expr_items(this.visibility)]);
    }

    for (const [value, cond] of this.defaults) {
      res.add(value);
      res = new Set([...res, ...expr_items(cond)]);
    }

    for (const [value, cond] of this.selects) {
      res.add(value);
      res = new Set([...res, ...expr_items(cond)]);
    }

    for (const [value, cond] of this.implies) {
      res.add(value);
      res = new Set([...res, ...expr_items(cond)]);
    }

    for (const [low, high, cond] of this.ranges) {
      res.add(low);
      res.add(high);
      res = new Set([...res, ...expr_items(cond)]);
    }

    return res;
  }

  /**
   * Returns a string representation of the menu node. Matches the Kconfig
   * format, with any parent dependencies propagated to the 'depends on'
   * condition.
   */
  public toString(): string {
    return this.custom_str(standard_sc_expr_str);
    // const fields: string[] = [];
    // const add = (str: string) => fields.push(str);

    // if (this.item instanceof Sym) {
    //   add('menu node for symbol ' + this.item.name);
    // } else if (this.item instanceof Choice) {
    //   let s = 'menu node for choice';
    //   if (this.item.name !== null) {
    //     s += ' ' + this.item.name;
    //   }
    //   add(s);
    // } else if (this.item === MENU) {
    //   add('menu node for menu');
    // } else {
    //   // this.item is COMMENT
    //   add('menu node for comment');
    // }

    // if (this.prompt) {
    //   add(`prompt "${this.prompt[0]}" (visibility ${BOOL_TO_STR[expr_value(this.prompt[1])]})`);
    // }

    // if (this.item instanceof Sym && this.is_menuconfig) {
    //   add('is menuconfig');
    // }

    // add('deps ' + BOOL_TO_STR[expr_value(this.dep)]);

    // if (this.item === MENU) {
    //   add("'visible if' deps " + BOOL_TO_STR[expr_value(this.visibility)]);
    // }

    // if (this.item instanceof Sym && this.help !== null) {
    //   add('has help');
    // }

    // if (this.list) {
    //   add('has child');
    // }

    // if (this.next) {
    //   add('has next');
    // }

    // add(`${this.filename}:${this.linenr}`);

    // return `<${fields.join(', ')}>`;
  }

  /**
   * Works like MenuNode.__str__(), but allows a custom format to be used
   * for all symbol/choice references. See expr_str().
   *
   * @param sc_expr_str_fn - The function to use for formatting symbol/choice references.
   * @returns The custom string representation of the menu node.
   */
  public custom_str(sc_expr_str_fn: (arg: any) => string): string {
    return _MENU_COMMENT.some((v) => v === this.item)
      ? this._menu_comment_node_str(sc_expr_str_fn)
      : this._sym_choice_node_str(sc_expr_str_fn);
  }

  /**
   * Helper function to generate the string representation for menu or comment nodes.
   *
   * @param sc_expr_str_fn - The function to use for formatting symbol/choice references.
   * @returns The string representation for menu or comment nodes.
   */
  _menu_comment_node_str(sc_expr_str_fn: (arg: any) => string): string {
    let s = this.item === MENU ? 'menu' : 'comment';
    s += ` "${this.prompt?.[0]}"`;

    if (this.dep !== this.kconfig.y) {
      s += `\n\tdepends on ${expr_str(this.dep, sc_expr_str_fn)}`;
    }

    if (this.item === MENU && this.visibility !== this.kconfig.y) {
      s += `\n\tvisible if ${expr_str(this.visibility, sc_expr_str_fn)}`;
    }

    return s;
  }

  /**
   * Helper function to generate the string representation for symbol or choice nodes.
   *
   * @param sc_expr_str_fn - The function to use for formatting symbol/choice references.
   * @returns The string representation for symbol or choice nodes.
   */
  _sym_choice_node_str(sc_expr_str_fn: (arg: any) => string): string {
    const indent_add = (s: string) => lines.push('\t' + s);
    const indent_add_cond = (s: string, cond: any) => {
      if (cond !== this.kconfig.y) {
        s += ' if ' + expr_str(cond, sc_expr_str_fn);
      }
      indent_add(s);
    };

    const sc = this.item;
    if (sc === null || typeof sc === 'number') {
      // TODO:
      return String(sc);
    }
    let lines: string[] = [];
    if (sc instanceof Sym) {
      lines = [`${this.is_menuconfig ? 'menuconfig ' : 'config '}${sc.name}`];
    } else {
      lines = [sc.name ? `choice ${sc.name}` : 'choice'];
    }

    if (sc.orig_type && !this.prompt) {
      // sc.orig_type!== UNKNOWN
      // If there's a prompt, we'll use the '<type> "prompt"' shorthand
      // instead
      indent_add(TYPE_TO_STR[sc.orig_type]);
    }

    if (this.prompt) {
      const prefix = sc.orig_type ? TYPE_TO_STR[sc.orig_type] : 'prompt';
      indent_add_cond(`${prefix} "${escape(this.prompt[0])}"`, this.orig_prompt?.[1]);
    }

    if (sc instanceof Sym) {
      if (sc.is_allnoconfig_y) {
        indent_add('option allnoconfig_y');
      }

      if (sc === sc.kconfig.defconfig_list) {
        indent_add('option defconfig_list');
      }

      if (sc.env_var !== null) {
        indent_add(`option env="${sc.env_var}"`);
      }

      for (const [low, high, cond] of this.orig_ranges) {
        indent_add_cond(`range ${sc_expr_str_fn(low)} ${sc_expr_str_fn(high)}`, cond);
      }
    }

    for (const [defaultValue, cond] of this.orig_defaults) {
      indent_add_cond(`default ${expr_str(defaultValue, sc_expr_str_fn)}`, cond);
    }

    if (sc instanceof Sym) {
      for (const [select, cond] of this.orig_selects) {
        indent_add_cond(`select ${sc_expr_str_fn(select)}`, cond);
      }

      for (const [imply, cond] of this.orig_implies) {
        indent_add_cond(`imply ${sc_expr_str_fn(imply)}`, cond);
      }
    }

    if (this.dep !== sc.kconfig.y) {
      indent_add(`depends on ${expr_str(this.dep, sc_expr_str_fn)}`);
    }

    if (this.help !== null) {
      indent_add('help');
      indent_add('  ' + this.help.split('\n').join(''));
    }

    return lines.join('\n');
  }

  /**
   * Helper function for removing MenuNode.dep from 'expr'. Uses two
   * pieces of internal knowledge: (1) Expressions are reused rather than
   * copied, and (2) the direct dependencies always appear at the end.
   */
  _strip_dep(expr: any): any {
    //... if dep ->... if y
    if (this.dep === expr) {
      return this.kconfig.y;
    }

    // (AND, X, dep) -> X
    if (Array.isArray(expr) && expr[0] === AND && expr[2] === this.dep) {
      return expr[1];
    }

    return expr;
  }
}

/**
 * TODO/NOTE Variable/preprocessor logic can be removed, thus this class was not refactored
 * Represents a preprocessor variable/function.
 */
class Variable {
  /**
   * The number of times the variable has been expanded.
   */
  _n_expansions: number;

  /**
   * True if the variable is recursive (defined with =).
   */
  is_recursive: boolean;

  /**
   * The unexpanded value of the variable.
   */
  value: unknown;

  constructor(
    /**
     * The Kconfig object that this choice belongs to.
     */
    public readonly kconfig: Kconfig,

    /**
     * The name of the variable.
     */
    public readonly name: string,
  ) {
    this._n_expansions = 0;
    this.is_recursive = false;
  }

  /**
   * The expanded value of the variable. For simple variables (those defined
   * with :=), this will equal 'value'. Accessing this property will raise a
   * KconfigError if the expansion seems to be stuck in a loop.
   *
   * Accessing this field is the same as calling expanded_value_w_args() with
   * no arguments. I hadn't considered function arguments when adding it. It
   * is retained for backwards compatibility though.
   */
  get expanded_value(): string {
    return this.expanded_value_w_args();
  }

  /**
   * Returns the expanded value of the variable/function. Any arguments
   * passed will be substituted for $(1), $(2), etc.
   *
   * Raises a KconfigError if the expansion seems to be stuck in a loop.
   */
  expanded_value_w_args(...args: string[]): string {
    return this.kconfig._fn_val([this.name, ...args]);
  }
}

/**
 * Exception raised for Kconfig-related errors.
 */
export class KconfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KconfigError';
  }
}

// Workaround:
//
// If 'errno' and'strerror' are set on IOError, then __str__() always returns
// "[Errno <errno>] <strerror>", ignoring any custom message passed to the
// constructor. By defining our own subclass, we can use a custom message while
// also providing 'errno','strerror', and 'filename' to scripts.
class KconfigIOError extends Error {
  msg: string;
  errno: number;
  strerror: string;
  filename: string;

  constructor(ioerror: any, msg: string) {
    super();
    this.msg = msg;
    this.errno = ioerror.errno;
    this.strerror = ioerror.strerror;
    this.filename = ioerror.filename;
  }

  /**
   * Overrides the default toString() method to return the custom message.
   */
  toString(): string {
    return this.msg;
  }
}
