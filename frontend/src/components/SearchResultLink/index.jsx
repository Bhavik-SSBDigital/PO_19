import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

const SearchResultLink = ({
  number,
  year,
  children,
  target = "_self",
  poMaterialNo,
  style,
}) => {
  const dataViewType = useSelector((state) => state.menu.dataViewType);

  const href = (() => {
    switch (dataViewType) {
      case "BPV":
        return `/search-data?year=${year}&paymentDocumentNumber=${number}`;
      case "PJV":
        return `/search-data?year=${year}&documentNo=${number}`;
      case "PO":
        return `/search-data?year=${year}&PONo=${poMaterialNo || number}`;
      case "NONPO":
        return `/search-data?year=${year}&documentNo=${number}`;
      default:
        return "#";
    }
  })();

  return (
    <Link
      to={href}
      target={target}
      style={{ textDecoration: "none", ...style }}
    >
      {children}
    </Link>
  );
};

export default SearchResultLink;
