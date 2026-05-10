/**
 * AR agent analysis prompts — pure strings only (no I/O).
 */

const AR_ANALYSIS_SYSTEM_PROMPT = `You are an Accounts Receivable AI Assistant.

You MUST respond with a single JSON object only (no markdown fences). Use exactly these keys:
- currentStatus (string, short operational label)
- riskLevel (exactly one of: LOW, MEDIUM, HIGH)
- customerIntent (exactly one of: PAYMENT, DELAY, DISPUTE, UNKNOWN)
- paymentLikelihood (integer 0-100)
- summary (string, 2-3 concise lines)
- recommendedAction (string, one clear next step)

Base reasoning ONLY on the structured facts provided. If email content is missing or ambiguous, use UNKNOWN for intent and moderate paymentLikelihood.`;

function buildArAnalysisUserPrompt(ctx = {}) {
  const customerName = ctx.customerName ?? '';
  const missingDocs = ctx.missingDocsText ?? '(none listed)';
  const confidenceScore = ctx.confidenceScoreText ?? '';
  const trackingEvents = ctx.trackingEventsText ?? '(no tracking events)';
  const latestEmailReplies = ctx.latestEmailRepliesText ?? '(no recent thread messages)';
  const paymentStatus = ctx.paymentStatusText ?? '';
  const workflowStatus = ctx.workflowStatusText ?? '';

  if (ctx.analysisScope === 'customer') {
    const portfolio = ctx.invoicesPortfolioText ?? '';
    const totalAmount = ctx.totalAmountText ?? ctx.amountText ?? '';
    const arEntryCount = ctx.arEntryCount ?? '';

    return `Analyze the following customer-level AR portfolio (multiple invoices may be involved).

Customer: ${customerName}
AR rows in cohort: ${arEntryCount}
Total amount (sum across cohort): ${totalAmount}

Per-invoice snapshot:
${portfolio}

Workflow status mix (system): ${workflowStatus}
Payment / collections signals (merged timelines): ${paymentStatus}

Missing Documents:
${missingDocs}

Confidence Score:
${confidenceScore}

Tracking Events (merged, chronological — invoice tags show source row):
${trackingEvents}

Recent Email Thread (latest 3 messages globally across cohort — truncated):
${latestEmailReplies}

Return one JSON assessment for the CUSTOMER as a whole (not one JSON per invoice).
`;
  }

  const invoiceNo = ctx.invoiceNo ?? '';
  const amount = ctx.amountText ?? '';

  return `Analyze the following invoice / AR data:

Invoice: ${invoiceNo}
Amount: ${amount}
Customer: ${customerName}

Workflow status (system): ${workflowStatus}
Payment / collections signals (from timeline): ${paymentStatus}

Missing Documents:
${missingDocs}

Confidence Score:
${confidenceScore}

Tracking Events:
${trackingEvents}

Recent Email Thread (latest replies — truncated):
${latestEmailReplies}

Return the JSON object as specified in your instructions.`;
}

module.exports = {
  AR_ANALYSIS_SYSTEM_PROMPT,
  buildArAnalysisUserPrompt,
};
