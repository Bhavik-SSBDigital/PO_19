import moment from "moment";

const dateFormat = "M/D/YYYY, h:mm:ss A";

/**
 *
 * @param {object} dateRange
 * @param {Date} dateRange.startDate
 * @param {Date} dateRange.endDate
 */
export const dateRangeToLocal = (dateRange) => {
  return {
    startDate: moment(dateRange.startDate).local().format(dateFormat),
    endDate: moment(dateRange.endDate).local().format(dateFormat),
  };
};
