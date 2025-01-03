import axios from 'axios';
import * as CryptoJS from 'crypto-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { stringify } from 'qs';

/** 需要用到的环境变量 */
interface MyEnv extends NodeJS.ProcessEnv {
  /** 有道翻译的ID */
  MY_YOUDAO_APP_ID: string;
  /** 有道翻译的秘钥 */
  MY_YOUDAO_APP_KEY: string;
}

/** 导入环境变量 */
const dotenvConfigOutput = dotenv.config({ path: resolve(__dirname, '../../.env.local') });
if (dotenvConfigOutput.error) {
  throw new Error(`导入环境变量出错: ${dotenvConfigOutput.error}`);
}

const menv = process.env as MyEnv;

/**
 * 截取字符串
 * @param q 字符串
 * @returns 截取后的字符串
 */
function truncate(q: string) {
  const len = q.length;
  if (len <= 20) return q;
  return q.substring(0, 10) + len + q.substring(len - 10, len);
}

/**
 * 调用有道翻译api。
 *
 * @note 只要请求成功就解析Promise，由调用方判断errorCode是否为0来判断翻译是否成功。
 *
 * @see {@link https://ai.youdao.com/DOCSIRMA/html/trans/api/plwbfy/index.html}
 *
 * 把应用ID和秘钥放在本项目主目录的`.env.local`文件中，例如：
 *
 * ```
 * MY_YOUDAO_APP_ID=应用ID
 * MY_YOUDAO_APP_KEY=应用密钥
 * ```
 *
 * @param options 翻译选项
 * @returns 翻译结果
 */
export async function translate(options: {
  /**
   * 要翻译的文本
   */
  query: string[];

  /**
   * 目标语言
   */
  to: string;

  /**
   * 源语言，默认为auto
   */
  from?: string;

  /**
   * 控制台创建的术语表ID，默认为空
   */
  vocabId?: string;
}): Promise<{
  /**
   * 错误返回码，0表示成功
   */
  errorCode: string;

  /**
   * 错误结果的序号
   */
  errorIndex?: number[];

  /**
   * 批量请求中存在正确结果时
   */
  translateResults?: Array<{
    /**
     * 翻译原句
     */
    query: string;

    /**
     * 翻译结果
     */
    translation: string;

    /**
     * 翻译所用的语言方向
     */
    type: string;
  }>;
}> {
  const { query, to, from = 'auto', vocabId } = options;
  const appKey = menv.MY_YOUDAO_APP_ID;
  const key = menv.MY_YOUDAO_APP_KEY;
  const salt = new Date().getTime();
  const curtime = Math.round(new Date().getTime() / 1000);
  const str1 = appKey + truncate(query.join('')) + salt + curtime + key;
  const sign = CryptoJS.SHA256(str1).toString(CryptoJS.enc.Hex);
  const res = await axios.post(
    'https://openapi.youdao.com/v2/api',
    stringify(
      {
        q: query,
        from,
        to,
        appKey,
        salt,
        sign: sign,
        signType: 'v3',
        curtime: curtime,
        vocabId: vocabId,
      },
      { arrayFormat: 'repeat' },
    ),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  return res.data;
}
