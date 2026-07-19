export type Severity = "low" | "medium" | "high" | "critical";
export type Verdict = "allow" | "quarantine" | "block";

export interface Finding {
  id: string;
  category:
    | "instruction_override"
    | "authority_impersonation"
    | "prompt_boundary"
    | "tool_manipulation"
    | "data_exfiltration"
    | "financial_manipulation"
    | "destructive_action"
    | "obfuscation"
    | "invisible_text"
    | "multilingual_override";
  severity: Severity;
  confidence: number;
  evidence: string;
  offset: number;
  message: string;
}

export interface ScanReport {
  schemaVersion: "boundary/2";
  scanId: string;
  scannedAt: string;
  source: { kind: "text" | "url"; value: string };
  content: { bytes: number; characters: number; sha256: string };
  verdict: Verdict;
  riskScore: number;
  findings: Finding[];
  contextEnvelope: string;
  limitations: string[];
}

export interface FetchedContent {
  finalUrl: string;
  contentType: string;
  text: string;
  bytes: number;
}
