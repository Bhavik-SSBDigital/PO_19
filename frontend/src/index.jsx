import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// scroll bar
import "simplebar/src/simplebar.css";

// third-party
import { Provider as ReduxProvider } from "react-redux";

// apex-chart
import "./assets/third-party/apex-chart.css";

// project import
import App from "./App";
import { store } from "./store";

// toastify messages
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// ==============================|| MAIN - REACT DOM RENDER  ||============================== //

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <ReduxProvider store={store}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </BrowserRouter>
  </ReduxProvider>
);