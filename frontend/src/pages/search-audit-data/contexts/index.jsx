// veiwdocument setViewDocument conext and useViewDocument hook
import { createContext, useContext, useState } from "react";

const ViewDocumentContext = createContext();

export const ViewDocumentProvider = ({ children }) => {
  const [viewDocument, setViewDocument] = useState({
    isOpen: false,
    document: null,
    documents: [],
  });
  return (
    <ViewDocumentContext.Provider value={{ viewDocument, setViewDocument }}>
      {children}
    </ViewDocumentContext.Provider>
  );
};

export const useViewDocument = () => useContext(ViewDocumentContext);
