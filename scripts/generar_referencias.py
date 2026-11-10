# -*- coding: utf-8 -*-
"""Genera test/referencias.json ejecutando el código Python ORIGINAL (solo lectura).

Uso (desde el repo de eiran, para que `app.budget` sea importable):

    cd ~/Datos/Projects/eiran-viabilidad
    ~/Datos/Projects/eiran/.venv/bin/python <este repo>/scripts/generar_referencias.py > <este repo>/test/referencias.json

`costo_hora` del repo de optimización se carga leyendo solo esa función de `modelo.py` (así no hace falta PuLP).
"""
from __future__ import annotations

import ast
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.getcwd())

from app.budget.cascade_engine import calculate_cascade, convertir_moneda  # noqa: E402
from app.budget.costo_laboral import costo_hora_empresa  # noqa: E402
from app.budget import riesgo as mc  # noqa: E402
from app.budget.schemas import (  # noqa: E402
    CurrencyType, EstimationDocument, EstimationNode, NodeType, NonLaborCost, ProjectParameters, RoleRate,
)

MODELO = Path.home() / "Datos/Projects/portafolio/optimizacion-presupuesto-ecommerce/src/optimizacion_ecommerce/modelo.py"


def cargar_costo_hora():
    arbol = ast.parse(MODELO.read_text(encoding="utf-8"))
    fn = next(n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == "costo_hora")
    mod = ast.Module(body=[ast.ImportFrom(module="typing", names=[ast.alias("Any")], level=0), fn], type_ignores=[])
    ns: dict = {}
    exec(compile(ast.fix_missing_locations(mod), str(MODELO), "exec"), ns)
    return ns["costo_hora"]


def sin_extras(sim: dict) -> dict:
    return {k: v for k, v in sim.items() if k not in ("config", "metodo", "supuestos", "lectura")}


ref: dict = {}

# 1. Nómina (eiran)
ref["costo_hora_empresa"] = [
    {"salario": s, "opciones": {}, "esperado": costo_hora_empresa(s)}
    for s in (5_600_000, 2_000_000, 2_846_999, 2_847_000, 1_423_500, 7_500_000, 3_900_000)
] + [{
    "salario": 2_500_000,
    "opciones": {"factorPrestacional": 0.6, "smmlv": 1_300_000, "auxilioTransporte": 162_000,
                 "limiteAuxilioSmmlv": 2, "horasSemana": 42, "semanasMes": 4.33},
    "esperado": costo_hora_empresa(2_500_000, factor_prestacional=0.6, smmlv=1_300_000, auxilio_transporte=162_000,
                                   limite_auxilio_smmlv=2, horas_semana=42, semanas_mes=4.33),
}]

# 2. costo_hora del repo de optimización (valores de datos/parametros.yaml)
costo_hora = cargar_costo_hora()
general = {"smmlv": 1423500, "auxilio_transporte": 200000, "limite_auxilio_smmlv": 2,
           "factor_prestacional": 0.52, "horas_semana": 40}
ref["costo_hora_modelo"] = {"general": general, "casos": [
    {"salario": s, "esperado": costo_hora("rol", s, general)}
    for s in (4_800_000, 5_600_000, 3_900_000, 4_500_000, 7_500_000, 6_100_000, 2_500_000)
]}

# 3. Percentiles y rangos
valores = sorted([3.0, 1.0, 4.0, 1.5, 9.0, 2.6, 5.3])
ref["percentil"] = {"valores": valores, "casos": [{"p": p, "esperado": mc.percentil(valores, p)} for p in (0, 10, 50, 80, 90, 100)]}
cfg = mc.configurar(None)
ref["rango_tarea"] = [
    {"tarea": t, "esperado": list(mc.rango_tarea(t, cfg))}
    for t in ({"nombre": "solo horas", "horas": 100}, {"nombre": "a y b", "horas": 50, "horas_optimista": 30, "horas_pesimista": 90},
              {"nombre": "solo b", "probable": 40, "pesimista": 70})
]

# 4. Monte Carlo
escenarios = [
    {"nombre": "pert básico", "tareas": [("login", 72, 90, 135, 30000.0), ("pagos", 80, 100, 150, 45000.0), ("panel", 88, 110, 165, 38000.0)],
     "capacidad": 105.0, "kw": {"costos_fijos": 2_000_000.0, "presupuesto_referencia": 13_000_000.0, "horas_referencia": 350.0}, "config": {}},
    {"nombre": "triangular", "tareas": [("api", 60, 80, 140, 52000.0), ("móvil", 200, 280, 480, 47000.0)],
     "capacidad": 70.0, "kw": {"presupuesto_referencia": 20_000_000.0}, "config": {"distribucion": "triangular", "iteraciones": 3000, "semilla": 7}},
    {"nombre": "bordes (a = m, a = b)", "tareas": [("fija", 40, 40, 40, 20000.0), ("sin optimista", 50, 50, 90, 25000.0), ("normal", 10, 20, 60, 25000.0)],
     "capacidad": 35.0, "kw": {}, "config": {"iteraciones": 1000, "semilla": 2026}},
    {"nombre": "semilla grande", "tareas": [("x", 1, 2, 30, 1000.0)], "capacidad": 10.0, "kw": {"horas_referencia": 5.0},
     "config": {"iteraciones": 500, "semilla": 2**40 + 7}},
]
ref["simular"] = []
for e in escenarios:
    tareas = [mc.TareaRiesgo(*t) for t in e["tareas"]]
    ref["simular"].append({**{k: e[k] for k in ("nombre", "tareas", "capacidad", "kw", "config")},
                           "esperado": sin_extras(mc.simular(tareas, e["capacidad"], config=e["config"], **e["kw"]))})

# 5. Moneda
ref["convertir_moneda"] = [
    {"args": [m, o, d, t, eu], "esperado": convertir_moneda(m, CurrencyType(o), CurrencyType(d), t, eu)}
    for m, o, d, t, eu in ((1_000_000, "COP", "USD", 4200, 1.08), (250, "USD", "COP", 3950.5, 1.08),
                           (100, "EUR", "COP", 4200, 1.1), (5_000_000, "COP", "EUR", 4100, 1.07), (77, "USD", "USD", 4200, 1.08))
]


# 6. Cascada (plana)
def cascada(doc: dict) -> dict:
    params = ProjectParameters(
        currency=CurrencyType(doc["moneda"]), usd_cop_rate=doc["usdCop"], eur_usd_rate=doc["eurUsd"],
        roles=[RoleRate(id=r["id"], label=r["etiqueta"], hourly_rate=r["tarifaHora"], currency=CurrencyType(r["moneda"])) for r in doc["roles"]],
        contingency_margin=doc["contingencia"], commercial_margin=doc["margen"], developers_count=doc["personas"],
        hours_per_week_per_dev=doc["horasSemana"], overtime_risk_threshold_weeks=doc["umbralSemanas"],
        non_labor_costs=[NonLaborCost(concept="x", amount=c["monto"], currency=CurrencyType(c["moneda"])) for c in doc["costosNoLaborales"]],
    )
    arbol = [EstimationNode(id=t["id"], name=t["nombre"], type=NodeType.TASK, base_hours=t["horas"], role_id=t["rol"],
                            enabled=t.get("activa", True)) for t in doc["tareas"]]
    c = calculate_cascade(EstimationDocument(id="ref", title="ref", parameters=params, tree=arbol))
    return {
        "totalHoras": c.total_hours, "contingenciaHoras": c.contingency_hours, "horasPlaneadas": c.total_hours_with_contingency,
        "manoObra": c.direct_labor_cost, "contingenciaCosto": c.contingency_cost, "noLaboral": c.non_labor_cost,
        "subtotal": c.subtotal, "margenCosto": c.commercial_margin_cost, "precio": c.final_price,
        "equivalente": {"usd": c.equivalent_price_usd, "cop": c.equivalent_price_cop},
        "roles": [{"id": r.role_id, "horas": r.hours, "tarifaHora": r.hourly_rate, "costo": r.total_cost,
                   "pctHoras": r.percentage_hours, "pctCosto": r.percentage_cost} for r in c.role_distribution],
        "niveles": {k: {"precio": getattr(c.tiers, k).price, "usd": getattr(c.tiers, k).price_usd, "cop": getattr(c.tiers, k).price_cop}
                    for k in ("minimo", "recomendado", "premium")},
        "capacidad": {"capacidadSemanal": c.capacity.weekly_capacity_hours, "semanas": c.capacity.estimated_weeks,
                      "diasHabiles": c.capacity.estimated_business_days, "riesgoSobretiempo": c.capacity.overtime_risk_factor,
                      "nivel": c.capacity.risk_level},
    }


docs = [
    {"moneda": "COP", "usdCop": 4200, "eurUsd": 1.08, "contingencia": 0.15, "margen": 0.2, "personas": 3, "horasSemana": 35,
     "umbralSemanas": 10,
     "roles": [{"id": "back", "etiqueta": "Backend", "tarifaHora": 53200.0, "moneda": "COP"},
               {"id": "front", "etiqueta": "Frontend", "tarifaHora": 45600.0, "moneda": "COP"},
               {"id": "ext", "etiqueta": "Consultor", "tarifaHora": 40.0, "moneda": "USD"}],
     "tareas": [{"id": "t1", "nombre": "Login", "horas": 90, "rol": "back"}, {"id": "t2", "nombre": "UI", "horas": 63.333333, "rol": "front"},
                {"id": "t3", "nombre": "Asesoría", "horas": 12.5, "rol": "ext"},
                {"id": "t4", "nombre": "Apagada", "horas": 40, "rol": "back", "activa": False}],
     "costosNoLaborales": [{"monto": 1_200_000, "moneda": "COP"}, {"monto": 99, "moneda": "USD"}]},
    {"moneda": "USD", "usdCop": 3987.65, "eurUsd": 1.08, "contingencia": 0.3, "margen": 0.35, "personas": 1, "horasSemana": 40,
     "umbralSemanas": 6,
     "roles": [{"id": "dev", "etiqueta": "Dev", "tarifaHora": 38000.0, "moneda": "COP"}],
     "tareas": [{"id": "a", "nombre": "A", "horas": 120, "rol": "dev"}, {"id": "b", "nombre": "B", "horas": 77.7, "rol": "dev"}],
     "costosNoLaborales": []},
    {"moneda": "EUR", "usdCop": 4200, "eurUsd": 1.1, "contingencia": 0.0, "margen": 0.1, "personas": 2, "horasSemana": 30,
     "umbralSemanas": 20,
     "roles": [{"id": "dev", "etiqueta": "Dev", "tarifaHora": 30.0, "moneda": "EUR"}],
     "tareas": [{"id": "a", "nombre": "A", "horas": 300, "rol": "dev"}],
     "costosNoLaborales": [{"monto": 500, "moneda": "EUR"}]},
]
ref["cascada"] = [{"doc": d, "esperado": cascada(d)} for d in docs]

# 7. Ejemplo precargado de la herramienta, de punta a punta, con el motor original
PIEZAS_EJEMPLO = [("login", 72, 90, 135), ("catalogo", 128, 160, 240), ("carrito", 80, 100, 150),
                  ("pagos", 80, 100, 150), ("panel", 88, 110, 165), ("deploy", 24, 40, 80)]
EQUIPO = [("frontend", "Frontend", 4_800_000, 1), ("backend", "Backend", 5_600_000, 1), ("qa", "QA / pruebas", 3_900_000, 1)]
tarifas = {rid: costo_hora_empresa(s) for rid, _, s, _ in EQUIPO}
personas = sum(n for *_, n in EQUIPO)
combinada = sum(n * tarifas[rid] for rid, _, _, n in EQUIPO) / personas
doc_ej = {"moneda": "COP", "usdCop": 4200, "eurUsd": 1.08, "contingencia": 0.15, "margen": 0.2, "personas": personas,
          "horasSemana": 35, "umbralSemanas": 10,
          "roles": [{"id": rid, "etiqueta": et, "tarifaHora": tarifas[rid], "moneda": "COP"} for rid, et, _, _ in EQUIPO],
          "tareas": [{"id": f"{pid}-{rid}", "nombre": pid, "horas": m * n / personas, "rol": rid}
                     for pid, a, m, b in PIEZAS_EJEMPLO for rid, _, _, n in EQUIPO],
          "costosNoLaborales": []}
cas = cascada(doc_ej)
sim = mc.simular([mc.TareaRiesgo(pid, a, m, b, combinada) for pid, a, m, b in PIEZAS_EJEMPLO], personas * 35.0,
                 costos_fijos=cas["noLaboral"], presupuesto_referencia=cas["manoObra"] + cas["contingenciaCosto"] + cas["noLaboral"],
                 horas_referencia=cas["horasPlaneadas"], config={"distribucion": "pert", "iteraciones": 5000, "semilla": 42})
ref["ejemplo"] = {"piezas": PIEZAS_EJEMPLO, "equipo": EQUIPO, "tarifas": tarifas, "tarifaCombinada": combinada,
                  "cascada": cas, "simular": sin_extras(sim), "lectura": sim.get("lectura")}

json.dump(ref, sys.stdout, ensure_ascii=False, indent=1)
print()
