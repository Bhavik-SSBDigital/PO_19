import { calculateDaysBetween } from "./calculateDaysBetween";

export const calculateDateRangeForTimeSlot = (
  filterType,
  timeSlot,
  startDate,
  endDate,
  isFirst,
  isLast
) => {
  if (filterType === "weekly") {
    return calculateStartAndEndHoursOfDate(timeSlot);
  }

  if (filterType === "monthly") {
    return calculateFirstAndLastDateOfMonthFromMonthYearString(timeSlot);
  }

  if (filterType === "custom") {
    const numberOfDays = calculateDaysBetween(startDate, endDate);

    if (numberOfDays <= 31) {
      return calculateStartAndEndHoursOfDate(timeSlot);
    } else {
      if (isFirst) {
        return calculateMonthRangeFromStartDate(startDate);
      }
      if (isLast) {
        return calculateMonthRangeFromEndDate(endDate);
      }
      return calculateFirstAndLastDateOfMonthFromMonthYearString(timeSlot);
    }
  }
};

/**
 * Calculate the first and last date of the month based on the input string.
 *
 * @param {string} monthYearString - The string representing the month and year (e.g., "January-2023").
 * @returns {Object} - An object containing the first and last date of the month.
 */
export function calculateFirstAndLastDateOfMonthFromMonthYearString(
  monthYearString
) {
  // Extract month and year from the input string
  const [month, year] = monthYearString.split("-");
  // Convert month string to a number (months are zero-indexed in JavaScript)
  const monthIndex = new Date(Date.parse(month + " 1, " + year)).getMonth();
  // Calculate the first date of the month
  const startDate = new Date(year, monthIndex, 1);
  // Calculate the last date of the month
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return {
    startDate,
    endDate,
  };
}

export function calculateStartAndEndHoursOfDate(date) {
  const startDate = new Date(date);
  const endDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}

export function calculateMonthRangeFromStartDate(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);

  const year = startDate.getFullYear();
  const month = startDate.getMonth();

  // Create a new date object representing the first day of the next month
  const firstDayOfNextMonth = new Date(year, month + 1, 1);

  // Subtract one day to get the last day of the current month
  const endDate = new Date(firstDayOfNextMonth.getTime() - 1);

  return {
    startDate,
    endDate,
  };
}

export function calculateMonthRangeFromEndDate(date) {
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const year = endDate.getFullYear();
  const month = endDate.getMonth();

  const startDate = new Date(year, month, 1, 0, 0, 0, 0);

  return {
    startDate,
    endDate,
  };
}
