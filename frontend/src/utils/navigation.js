export const poMaterialNumberSearch = (poMaterialNumber) => {
  const url = `/search-data?PONo=${poMaterialNumber}`;
  window.open(url, "_blank");
};

export const documentSearch = (documentNo, year) => {
  const url = `/search-data?documentNo=${documentNo}&year=${year}`;
  window.open(url, "_blank");
};
