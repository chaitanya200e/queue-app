import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import AdminLogin from "./pages/AdminLogin";
import AdminSignup from "./pages/AdminSignup";
import AdminRequest from "./pages/AdminRequest";
import AdminDashboard from "./pages/AdminDashboard";
import Display from "./pages/Display";
import LanguageSelector from "./LanguageSelector";
import "./styles/style.css";

export default function App() {
  return (
    <BrowserRouter>
      <LanguageSelector />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin-signup" element={<AdminSignup />} />
        <Route path="/admin-request" element={<AdminRequest />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/display" element={<Display />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
