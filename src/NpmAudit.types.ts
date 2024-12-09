export interface Vulnerabilities {
  vulnerabilities: Record<string, Vulnerability>;
}

interface Vulnerability {
  name: string;
  severity: string; // "low" | "high" | ?
  isDirect: boolean;
  via: (string | Via)[];
  effects: unknown[];
  range: string;
  nodes: string[];
  fixAvailable: boolean | FixAvailable;
}

export interface Via {
  source: number;
  name: string;
  dependency: string;
  title: string;
  url: string;
  severity: string;
  cwe: string[];
  cvss: CVSS;
  range: string;
}

interface CVSS {
  score: number;
  vectorString: string;
}

interface FixAvailable {
  name: string;
  version: string;
  isSemVerMajor: boolean;
}
