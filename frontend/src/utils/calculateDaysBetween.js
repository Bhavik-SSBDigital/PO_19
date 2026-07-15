/**
 * Calculate the number of days between two dates.
 *
 * @param {string} startDateStr - The start date in the format "YYYY-MM-DD".
 * @param {string} endDateStr - The end date in the format "YYYY-MM-DD".
 * @returns {number} - The number of days between the start and end dates.
 */
export function calculateDaysBetween(startDateStr, endDateStr) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  // Calculate the difference in milliseconds
  const differenceInMs = endDate.getTime() - startDate.getTime();

  // Convert milliseconds to days (1 day = 24 * 60 * 60 * 1000 milliseconds)
  const daysDifference = Math.ceil(differenceInMs / (1000 * 60 * 60 * 24));

  return daysDifference;
}
