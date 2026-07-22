// Shared by every table that lists PO lines (Executive Dashboard's PO-Wise
// Exceptions table AND the Drilldown dialog), so "open in new tab" always
// points to the same Search Audit Data route, prefilled the same way.
export const buildSearchUrl = (poNumber, lineItem) =>
  `/search-data?PONo=${encodeURIComponent(poNumber)}${
    lineItem ? `&poLineItem=${encodeURIComponent(lineItem)}` : ""
  }`;

export const getFirstLineItem = (r) => {
  if (!r) return "";
  if (Array.isArray(r.lineItems) && r.lineItems.length) return r.lineItems[0];
  return r.poLineItem || r.lineItem || "";
};
