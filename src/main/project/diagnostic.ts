import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { getConfig } from '../base/workspace';
import { Logger } from '../base/logger';
import { findLastMatch } from '../../common/utils';

/**
 * 诊断项1
 */
const DIAGNOSTIC_CODE_ENTER = 'rt_interrupt_enter';

/**
 * 诊断项2
 */
const DIAGNOSTIC_CODE_LEAVE = 'rt_interrupt_leave';

/**
 * 诊断结果集合
 */
let sDiagnostics: vscode.DiagnosticCollection;

/**
 * 诊断的路径模式
 */
let diagnosticGlobPattern = '**/stm32*_it.c';

/**
 * 日志记录器
 */
const logger = new Logger('main/project/diagnostic');

/**
 * 创建工作区中的中断函数诊断及其快速修复。
 * @param context 扩展的上下文
 */
function createInterruptDiagnosticAndQuickfix(context: vscode.ExtensionContext) {
  const isAuto = getConfig(null, 'autoDiagnosticInterrupt.enable', false);
  diagnosticGlobPattern = getConfig(null, 'autoDiagnosticInterrupt.globPattern', '**/stm32*_it.c');
  sDiagnostics = vscode.languages.createDiagnosticCollection('RT-Thread');
  context.subscriptions.push(sDiagnostics);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'c' }, new QuickFixProvider(), {
      providedCodeActionKinds: QuickFixProvider.providedCodeActionKinds,
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length) {
        autoDiagnostic(e.document);
      }
    }),
  );

  if (isAuto) {
    vscode.workspace.findFiles(diagnosticGlobPattern).then((uris) => {
      for (const uri of uris) {
        vscode.workspace.openTextDocument(uri).then((doc) => autoDiagnostic(doc));
      }
    });
    context.subscriptions.push(
      vscode.workspace.onDidCreateFiles((event) => {
        for (const uri of event.files) {
          sDiagnostics.delete(uri);
        }
      }),
    );
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => autoDiagnostic(doc)));
    context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles((event) => {
        for (const uri of event.files) {
          sDiagnostics.delete(uri);
        }
      }),
    );
  }
}

/**
 * 在给定字符串中查找与指定左大括号匹配的右大括号的位置。
 *
 * 此函数通过使用栈数据结构来追踪未匹配的左大括号，从而找到与给定左大括号匹配的右大括号。
 * 它遍历字符串，从指定的左大括号位置开始，直到字符串的末尾。
 * 如果在遍历过程中遇到未匹配的右大括号或未找到匹配的右大括号，则抛出错误。
 *
 * @param input 输入的字符串，用于查找匹配的右大括号
 * @param leftBraceIndex 指定左大括号在字符串中的索引位置
 * @returns 返回匹配的右大括号在字符串中的索引位置
 * @throws 如果输入无效、找到未匹配的右大括号、未找到匹配的右大括号或存在未匹配的左大括号，则抛出错误
 */
function findMatchingRightBrace(input: string, leftBraceIndex: number): number {
  if (input === null || input === undefined || leftBraceIndex < 0 || leftBraceIndex >= input.length) {
    throw new Error('Invalid input or leftBraceIndex');
  }
  const stack: number[] = [];
  for (let i = leftBraceIndex; i < input.length; i++) {
    if (input[i] === '{') {
      stack.push(i);
    } else if (input[i] === '}') {
      if (stack.length === 0) {
        throw new Error('Unmatched right brace at index ' + i);
      }
      stack.pop();
      if (stack.length === 0) {
        return i;
      }
    }
  }
  if (stack.length > 0) {
    throw new Error('Unmatched left brace at index ' + leftBraceIndex);
  }
  throw new Error('No matching right brace found');
}

/**
 * 快速修复器。
 *
 * 如果函数体有`USER CODE`模板，在BEGIN和END之间添加；否则在开头和结尾处添加。
 */
class QuickFixProvider implements vscode.CodeActionProvider {
  /**
   * 提供的代码操作类型。
   */
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  /**
   * 快速修复文本文档的诊断。
   * @param doc 文本文档
   * @param diagnostic 诊断
   * @param fix 修复
   */
  private edit(doc: vscode.TextDocument, diagnostic: vscode.Diagnostic, fix: vscode.CodeAction) {
    let editTextLine;
    let spaceIndentSize = 4;
    if (diagnostic.code === DIAGNOSTIC_CODE_LEAVE) {
      const regex = /^([ \t]*)(?:\/\* USER CODE END )/gm;
      const match = findLastMatch(regex, doc.getText(diagnostic.range));
      let tokenIndex;
      if (match) {
        spaceIndentSize = match[1].length;
        tokenIndex = doc.offsetAt(diagnostic.range.start) + match.index;
      } else {
        tokenIndex = doc.offsetAt(diagnostic.range.end) - 1;
      }
      editTextLine = doc.lineAt(doc.positionAt(tokenIndex));
    } else {
      const regex = /^([ \t]*)(?:\/\* USER CODE BEGIN )/m;
      const match = regex.exec(doc.getText(diagnostic.range));
      let tokenIndex;
      if (match) {
        spaceIndentSize = match[1].length;
        tokenIndex = doc.offsetAt(diagnostic.range.start) + match.index;
      } else {
        tokenIndex = doc.offsetAt(diagnostic.range.start);
      }
      const tokenLineIndex = doc.lineAt(doc.positionAt(tokenIndex)).lineNumber;
      editTextLine = doc.lineAt(tokenLineIndex + 1);
    }

    let newText = diagnostic.code === DIAGNOSTIC_CODE_LEAVE ? 'rt_interrupt_leave' : 'rt_interrupt_enter';
    for (let i = 0; i < spaceIndentSize; i++) {
      newText = ' ' + newText;
    }
    newText += '();';
    newText += doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    fix.edit?.insert(doc.uri, editTextLine.range.start, newText);
    fix.diagnostics = [diagnostic];
  }

  /**
   * 修复文本文档的单个诊断。
   * @param document 文本文档
   * @param diagnostic 诊断
   */
  private fixEdit(document: vscode.TextDocument, diagnostic: vscode.Diagnostic) {
    const fix = new vscode.CodeAction(
      vscode.l10n.t(
        'Add {0}() call',
        diagnostic.code === DIAGNOSTIC_CODE_LEAVE ? 'rt_interrupt_leave' : 'rt_interrupt_enter',
      ),
      vscode.CodeActionKind.QuickFix,
    );
    fix.edit = new vscode.WorkspaceEdit();
    this.edit(document, diagnostic, fix);
    return fix;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const fixes = context.diagnostics
      .filter((diagnostic) => diagnostic.code === DIAGNOSTIC_CODE_ENTER || diagnostic.code === DIAGNOSTIC_CODE_LEAVE)
      .map((diagnostic) => this.fixEdit(document, diagnostic));

    const allDiagnostics = sDiagnostics.get(document.uri) || [];
    if (allDiagnostics.length > 1) {
      const fixAll = new vscode.CodeAction(vscode.l10n.t('Add any missing calls'), vscode.CodeActionKind.QuickFix);
      fixAll.edit = new vscode.WorkspaceEdit();
      allDiagnostics.forEach((diagnostic) => {
        this.edit(document, diagnostic, fixAll);
      });
      fixAll.diagnostics = [...allDiagnostics];
      fixAll.isPreferred = true;
      fixes.unshift(fixAll);
    }

    return fixes;
  }
}

/**
 * 诊断文档。
 * @param doc 文档
 */
function startDiagnostic(doc: vscode.TextDocument) {
  logger.debug('diagnostic interrupt:', doc.uri.fsPath);
  const results: vscode.Diagnostic[] = [];
  const fileContent = doc.getText();
  const iRQHandlers: Array<{
    /** 函数名称 */
    functionName: string;
    /** 整个函数的文本 */
    functionBody: string;
    /** 左右大括号及之间文本的位置 */
    range: vscode.Range;
  }> = [];
  const regex = /void\s+([\w\d_]+_IRQHandler)\s*\(\s*void\s*\)\s*\{/g;
  let match;
  while ((match = regex.exec(fileContent))) {
    const functionName = match[1];
    const leftBraceIndex = match.index + match[0].length - 1;
    const rightBraceIndex = findMatchingRightBrace(fileContent, leftBraceIndex);
    const start = doc.positionAt(leftBraceIndex);
    const end = doc.positionAt(rightBraceIndex + 1);
    const functionBody = fileContent.slice(leftBraceIndex, rightBraceIndex + 1);
    iRQHandlers.push({
      functionName,
      functionBody,
      range: new vscode.Range(start, end),
    });
  }

  for (const handler of iRQHandlers) {
    const { functionName, functionBody, range } = handler;
    if (!/^\s*rt_interrupt_enter\s*\(\s*\)\s*;/m.test(functionBody)) {
      results.push({
        source: 'RT-Thread',
        code: DIAGNOSTIC_CODE_ENTER,
        message: vscode.l10n.t('Expect call {0} before processing {1}', 'rt_interrupt_enter()', functionName),
        range,
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
    if (!/^\s*rt_interrupt_leave\s*\(\s*\)\s*;/m.test(functionBody)) {
      results.push({
        source: 'RT-Thread',
        code: DIAGNOSTIC_CODE_LEAVE,
        message: vscode.l10n.t('Expect call {0} after processing {1}', 'rt_interrupt_leave()', functionName),
        range,
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }
  if (results.length) {
    logger.info(`found ${results.length} problem(s) in ${doc.uri.fsPath}`);
  }
  sDiagnostics.set(doc.uri, results);
}

/**
 * 诊断指定的文档。
 *
 * 检查`xxx_IRQHandler`函数是否成对调用了rt_interrupt_enter()和rt_interrupt_leave()，
 * 不满足条件时在“问题”面板显示警告。
 *
 * @param doc 文档
 */
function doDiagnosticInterrupt(doc: vscode.TextDocument) {
  if (!sDiagnostics.has(doc.uri)) {
    sDiagnostics.set(doc.uri, []);
  }
  startDiagnostic(doc);
}

/**
 * 自动诊断指定的文档。
 * 如果文档符合配置的glob模式或已经存在诊断结果，则发起诊断。
 * @param doc 文档
 */
function autoDiagnostic(doc: vscode.TextDocument) {
  const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
  if (minimatch(relativePath, diagnosticGlobPattern) || sDiagnostics.has(doc.uri)) {
    startDiagnostic(doc);
  }
}

export { createInterruptDiagnosticAndQuickfix, doDiagnosticInterrupt };
