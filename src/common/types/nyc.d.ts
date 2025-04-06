declare module 'nyc' {
  interface NycOptions {
    all?: boolean;
    cwd?: string;
    exclude?: string | string[];
    include?: string | string[];
    reporter?: string | string[];
    reportDir?: string;
    sourceMap?: boolean;
    tempDirectory?: string;
  }

  class NYC {
    constructor(options?: NycOptions);
    reset(): Promise<void>;
    writeCoverageFile(): void;
    report(reporters?: string[]): Promise<void>;
  }

  namespace NYC {}
  export = NYC;
}
