import { useEffect } from "react";

import { followDocumentNotices } from "../services/documentNotices";

export const useDocumentNotices = () => {
  useEffect(followDocumentNotices, []);
};
