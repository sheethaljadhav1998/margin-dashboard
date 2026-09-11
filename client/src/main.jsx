import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./AppLayout.jsx";
import { CategoriesPage } from "./pages/CategoriesPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { DepartmentPage } from "./pages/DepartmentPage.jsx";
import { DepartmentsPage } from "./pages/DepartmentsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { ProductivityPage } from "./pages/ProductivityPage.jsx";
import { ProjectPage } from "./pages/ProjectPage.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:refCode" element={<ProjectPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/departments/:department" element={<DepartmentPage />} />
          <Route path="/productivity" element={<ProductivityPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
