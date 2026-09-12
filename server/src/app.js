import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoriesView,
  computeModel,
  dashboardView,
  departmentView,
  departmentsView,
  productivityView,
  projectView,
  projectsView,
} from "../calc/index.js";
import { ingestFile, ParseError } from "../ingest/index.js";
import { parsePeriod, serialize, toCsv } from "./http.js";
import { loadCalcInput, loadSettings, saveSettings } from "./load.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function modelFrom(db) {
  return computeModel(loadCalcInput(db));
}

export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/api/upload",
    upload.fields([
      { name: "timesheet", maxCount: 1 },
      { name: "salary", maxCount: 1 },
      { name: "projects", maxCount: 1 },
    ]),
    (req, res, next) => {
      try {
        const files = req.files ?? {};
        const jobs = [
          { field: "timesheet", expectedKind: "timesheet" },
          { field: "salary", expectedKind: "salary" },
          { field: "projects", expectedKind: "projects" },
        ];
        const ingested = [];
        for (const job of jobs) {
          const file = files[job.field]?.[0];
          if (!file) continue;
          ingested.push(
            ingestFile(db, file.buffer, {
              expectedKind: job.expectedKind,
              filename: file.originalname,
            }),
          );
        }
        if (!ingested.length) {
          res.status(400).json({
            error: "Attach at least one file as timesheet, salary, or projects",
          });
          return;
        }
        const model = modelFrom(db);
        res.json({
          ingested,
          issues: model.issues,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get("/api/dashboard", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      const model = modelFrom(db);
      const view = dashboardView(model, period);
      res.json(
        serialize({
          ...view,
          filters: {
            years: [...new Set(model.months.map((m) => m.year))],
            months: [...new Set(model.months.filter((m) => period.year == null || m.year === period.year).map((m) => m.month))],
          },
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/projects", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      res.json(serialize(projectsView(modelFrom(db), period)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/projects/:refCode", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      const view = projectView(modelFrom(db), req.params.refCode, period);
      if (!view) {
        res.status(404).json({ error: `No project ${req.params.refCode}` });
        return;
      }
      res.json(serialize(view));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/productivity", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      res.json(serialize(productivityView(modelFrom(db), period)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/categories", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      res.json(serialize(categoriesView(modelFrom(db), period)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/departments", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      res.json(serialize(departmentsView(modelFrom(db), period)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/departments/:department", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      const view = departmentView(modelFrom(db), req.params.department, period);
      res.json(serialize(view));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/settings", (_req, res) => {
    res.json(loadSettings(db));
  });

  app.put("/api/settings", (req, res, next) => {
    try {
      const body = req.body ?? {};
      const saved = saveSettings(db, {
        billableCategories: body.billableCategories,
        overhead: body.overhead,
      });
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/export/:resource", (req, res, next) => {
    try {
      const period = parsePeriod(req.query);
      const model = modelFrom(db);
      const resource = String(req.params.resource).replace(/\.csv$/i, "");
      const { columns, rows, filename } = exportTable(model, resource, period);
      const body = toCsv(columns, serialize(rows));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(body);
    } catch (err) {
      next(err);
    }
  });

  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof ParseError || err.status) {
      res.status(err.status || 400).json({ error: err.message, ...err.extras });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

function exportTable(model, resource, period) {
  switch (resource) {
    case "dashboard": {
      const view = dashboardView(model, period);
      return {
        filename: "dashboard.csv",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value" },
        ],
        rows: [
          { metric: "totalHours", value: view.totalHours },
          { metric: "billableHours", value: view.billableHours },
          { metric: "costAed", value: view.costAed },
          { metric: "revenueAed", value: view.revenueAed },
          { metric: "margin", value: view.margin },
        ],
      };
    }
    case "projects": {
      return {
        filename: "projects.csv",
        columns: [
          { key: "refCode", label: "Ref Code" },
          { key: "name", label: "Project" },
          { key: "priceAed", label: "Price" },
          { key: "hours", label: "Hours" },
          { key: "costAed", label: "Cost" },
          { key: "revenueAed", label: "Revenue" },
          { key: "margin", label: "Margin" },
        ],
        rows: projectsView(model, period),
      };
    }
    case "productivity": {
      return {
        filename: "productivity.csv",
        columns: [
          { key: "employeeNo", label: "Employee No." },
          { key: "employeeName", label: "Name" },
          { key: "department", label: "Department" },
          { key: "billableHours", label: "Billable hours" },
          { key: "totalHours", label: "Total hours" },
          { key: "productivity", label: "Productivity" },
        ],
        rows: productivityView(model, period),
      };
    }
    case "categories": {
      return {
        filename: "categories.csv",
        columns: [
          { key: "category", label: "Category" },
          { key: "isBillable", label: "Billable" },
          { key: "hours", label: "Hours" },
          { key: "share", label: "Share" },
        ],
        rows: categoriesView(model, period),
      };
    }
    case "departments": {
      return {
        filename: "departments.csv",
        columns: [
          { key: "department", label: "Department" },
          { key: "hours", label: "Hours" },
          { key: "billableHours", label: "Billable hours" },
          { key: "costAed", label: "Loaded cost" },
          { key: "directCostAed", label: "Direct cost" },
        ],
        rows: departmentsView(model, period),
      };
    }
    default: {
      const err = new Error("Unknown export resource");
      err.status = 404;
      throw err;
    }
  }
}
