import moment from "moment";
import { calculateDaysBetween } from "./calculateDaysBetween";

export const formatTimeSlot = (timeSlot, filterType, startDate, endDate) => {
  if (filterType === "weekly") return moment(timeSlot).format("DD-MM-YYYY");

  if (filterType === "monthly") return timeSlot;

  if (filterType === "custom") {
    const numberOfDays = calculateDaysBetween(startDate, endDate);

    return numberOfDays <= 31
      ? moment(timeSlot).format("DD-MM-YYYY")
      : timeSlot;
  }
};
