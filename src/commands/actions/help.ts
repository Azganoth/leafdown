import { useCommandUIStore } from "../stores/commandUi";

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};
