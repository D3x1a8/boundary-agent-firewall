import { createHash, randomUUID } from "node:crypto";
import type { Finding, ScanReport, Severity } from "./types.js";

interface Rule {
  id: string;
  category: Finding["category"];
  severity: Severity;
  confidence: number;
  score: number;
  forceBlock?: boolean;
  message: string;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    id: "override.instructions", category: "instruction_override", severity: "high", confidence: 0.94, score: 36,
    message: "Attempts to replace or disregard controlling instructions.",
    patterns: [
      /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/i,
      /disregard\s+(?:all\s+)?(?:previous|prior|above)/i,
      /forget\s+(?:everything|all|your)\s+(?:instructions?|rules?|prompt)?/i,
      /(?:new|replacement)\s+instructions?\s*:/i,
      /your\s+(?:real|actual)\s+instructions?\s+(?:are|is)/i,
      /override\s+(?:all\s+)?(?:safety|policy|restrictions?)/i,
    ],
  },
  {
    id: "authority.impersonation", category: "authority_impersonation", severity: "medium", confidence: 0.82, score: 20,
    message: "Claims privileged authority inside untrusted content.",
    patterns: [
      /i\s+am\s+(?:your\s+)?(?:creator|admin|owner|developer)/i,
      /(?:system|admin|developer)\s+(?:message|override|update)/i,
      /authorized\s+by\s+(?:the\s+)?(?:admin|system|creator)/i,
      /(?:developer|admin)\s+mode/i,
    ],
  },
  {
    id: "boundary.tokens", category: "prompt_boundary", severity: "critical", confidence: 0.98, score: 45,
    message: "Contains model or prompt boundary tokens.",
    patterns: [
      /<\|(?:im_start|im_end|endoftext)\|>/i, /<\/?(?:system|prompt)>/i, /\[\/?INST\]/i,
      /<<\/?SYS>>/i, /BEGIN\s+NEW\s+(?:PROMPT|INSTRUCTIONS?)/i, /END\s+OF\s+(?:SYSTEM|PROMPT)/i,
    ],
  },
  {
    id: "tool.manipulation", category: "tool_manipulation", severity: "high", confidence: 0.89, score: 32,
    message: "Tries to make the reader execute tools or commands.",
    patterns: [
      /(?:execute|run)\s+(?:the\s+)?(?:following\s+)?(?:command|tool|shell)/i,
      /(?:tool_call|function_call)\s*[:=(]/i,
      /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/i,
      /(?:call|invoke)\s+(?:the\s+)?(?:transfer|delete|shell|exec)[-_ ]?(?:tool|function)/i,
    ],
  },
  {
    id: "exfiltration.secrets", category: "data_exfiltration", severity: "critical", confidence: 0.93, score: 45, forceBlock: true,
    message: "Requests secrets or attempts to send private context elsewhere.",
    patterns: [
      /(?:reveal|print|return|send|exfiltrate)\s+(?:the\s+)?(?:system prompt|developer message|api key|private key|secret|credentials?)/i,
      /(?:upload|post|send)\s+(?:conversation|context|history|secrets?|credentials?)\s+to\s+https?:\/\//i,
      /!\[[^\]]*\]\(https?:\/\/[^)]*(?:secret|token|key|data|context)=/i,
      /https?:\/\/[^\s)]+\?(?:[^\s)]*&)?(?:secret|token|key|context|data)=\{?\{?/i,
    ],
  },
  {
    id: "finance.redirect", category: "financial_manipulation", severity: "critical", confidence: 0.97, score: 55, forceBlock: true,
    message: "Attempts to redirect or drain funds.",
    patterns: [
      /(?:send|transfer|withdraw)\s+(?:all\s+)?(?:your\s+)?(?:usdc|funds?|money|credits?|balance)/i,
      /(?:empty|drain)\s+(?:your\s+)?(?:wallet|funds?|account)/i,
      /send\s+to\s+0x[0-9a-fA-F]{40}/i, /pay\s+(?:me|this\s+wallet)/i,
    ],
  },
  {
    id: "destructive.action", category: "destructive_action", severity: "critical", confidence: 0.96, score: 55, forceBlock: true,
    message: "Contains destructive actions aimed at agent state or infrastructure.",
    patterns: [
      /rm\s+-rf(?:\s+\/|\s+~|\s+\.)/i,
      /(?:delete|destroy)\s+(?:all\s+)?(?:your\s+)?(?:database|state|memory|files?|logs?)/i,
      /(?:drop\s+table|format\s+(?:the\s+)?disk)/i,
      /(?:disable|stop)\s+(?:your\s+)?(?:heartbeat|service|daemon)/i,
      /(?:remove|delete)\s+(?:your\s+)?(?:wallet|private key|identity)/i,
    ],
  },
  {
    id: "obfuscation.payload", category: "obfuscation", severity: "medium", confidence: 0.68, score: 16,
    message: "Contains encoding or character patterns often used to hide instructions.",
    patterns: [/(?:atob|base64_decode|rot13)\s*\(/i, /(?:\\u[0-9a-fA-F]{4}){6,}/, /(?:\\x[0-9a-fA-F]{2}){5,}/, /(?:[A-Za-z0-9+/]{48,}={0,2})/],
  },
  {
    id: "invisible.characters", category: "invisible_text", severity: "high", confidence: 0.91, score: 28,
    message: "Contains invisible Unicode characters that can conceal instructions.", patterns: [/[​‌‍⁠﻿]/],
  },
  {
    id: "override.multilingual", category: "multilingual_override", severity: "high", confidence: 0.9, score: 38,
    message: "Contains a non-English instruction-override phrase.",
    patterns: [
      /忽略[一-龥]*(?:指令|说明|提示)/, /игнорируй\s+(?:все|предыдущие)/i,
      /ignora\s+(?:todas?\s+)?(?:las?\s+)?instrucciones?\s+anteriores?/i,
      /ignoriere\s+(?:alle\s+)?(?:vorherigen?\s+)?anweisungen/i,
      /ignore[rz]?\s+(?:toutes?\s+)?(?:les?\s+)?instructions?\s+(?:pr[eé]c[eé]dentes?|ant[eé]rieures?)/i,
      /指示を無視/, /تعليمات\s+جديدة/,
    ],
  },
];

function excerpt(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 28);
  const end = Math.min(text.length, offset + length + 28);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

function stripBoundaryTokens(text: string): string {
  return text
    .replace(/<\|(?:im_start|im_end|endoftext)\|>/gi, "[boundary removed]")
    .replace(/<\/?(?:system|prompt)>/gi, "[boundary removed]")
    .replace(/\[\/?INST\]/gi, "[boundary removed]")
    .replace(/<<\/?SYS>>/gi, "[boundary removed]")
    .replace(/[​‌‍⁠﻿]/g, "");
}

export function scanText(text: string, source: { kind: "text" | "url"; value: string }): ScanReport {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n");
  const findings: Finding[] = [];
  let rawScore = 0;
  let forcedBlock = false;

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(normalized);
      if (!match || match.index === undefined) continue;
      findings.push({
        id: rule.id, category: rule.category, severity: rule.severity, confidence: rule.confidence,
        evidence: excerpt(normalized, match.index, match[0].length), offset: match.index, message: rule.message,
      });
      rawScore += rule.score;
      forcedBlock ||= Boolean(rule.forceBlock);
      break;
    }
  }

  const riskScore = Math.min(100, rawScore);
  const verdict = forcedBlock || riskScore >= 70 ? "block" : findings.length > 0 ? "quarantine" : "allow";
  const sha256 = createHash("sha256").update(normalized, "utf8").digest("hex");
  const contextEnvelope = verdict === "block"
    ? `[BOUNDARY QUARANTINED sha256=${sha256}: content omitted]`
    : `<untrusted_content sha256="${sha256}">\n${stripBoundaryTokens(normalized)}\n</untrusted_content>`;

  return {
    schemaVersion: "boundary/1", scanId: randomUUID(), scannedAt: new Date().toISOString(), source,
    content: { bytes: Buffer.byteLength(normalized, "utf8"), characters: normalized.length, sha256 },
    verdict, riskScore, findings, contextEnvelope,
    limitations: [
      "Deterministic detection reduces risk but cannot prove content is safe.",
      "Keep privileged tool execution behind independent policy checks and human approval.",
    ],
  };
}
