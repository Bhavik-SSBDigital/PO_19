// ASSUMPTION: PO Type "ZTWK" identifies RC-placeholder rows used only to
// carry Rate Contract data into POAUDIT - not real transactional purchase
// orders (net value 0, blank PO status, "Our Ref." tagged as an RC carrier
// row). These should never surface as a "PO" anywhere in PO Data or the
// Executive Dashboard. Confirm with the client if other PO types need the
// same treatment.
export const RC_PLACEHOLDER_PO_TYPES = ["ZTWK"];
