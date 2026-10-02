import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import ComoFunciona from "./pages/ComoFunciona";
import Precos from "./pages/Precos";
import Faq from "./pages/Faq";
import Demo from "./pages/Demo";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="como-funciona" element={<ComoFunciona />} />
          <Route path="precos" element={<Precos />} />
          <Route path="faq" element={<Faq />} />
          <Route path="demo" element={<Demo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
