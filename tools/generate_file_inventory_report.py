from pathlib import Path
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs"
PDF_PATH = OUTPUT_DIR / "inventaire-fichiers-pfe-sentinel.pdf"
MD_PATH = OUTPUT_DIR / "inventaire-fichiers-pfe-sentinel.md"

EXCLUDED_DIRS = {
    ".git",
    ".cache",
    ".semgrep",
    ".sixth",
    "node_modules",
    "build",
}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def should_skip(path: Path) -> bool:
    parts = set(path.relative_to(ROOT).parts)
    return bool(parts.intersection(EXCLUDED_DIRS))


def file_kind(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if path.endswith(".env"):
        return "configuration sensible"
    if suffix in {".js", ".jsx", ".ts", ".tsx", ".py"}:
        return "code"
    if suffix == ".css":
        return "style"
    if suffix in {".json", ".lock", ".yaml", ".yml", ".conf"}:
        return "configuration"
    if suffix in {".md", ".txt"}:
        return "documentation"
    if suffix in {".png", ".jpg", ".jpeg", ".svg", ".ico"}:
        return "image ou icone"
    if suffix in {".pdf", ".zip", ".csv", ".jsonl"}:
        return "donnee ou document"
    if "Dockerfile" in Path(path).name or suffix == ".dockerignore":
        return "docker"
    return "autre"


def explain(path: str) -> str:
    p = path.replace("\\", "/")
    name = Path(p).name
    suffix = Path(p).suffix.lower()

    exact = {
        "backend/server.js": "Point d'entree du backend Express. Configure securite, middlewares, routes REST et demarrage serveur.",
        "backend/db.js": "Connexion MongoDB via Mongoose et fonctions d'attente de disponibilite de la base.",
        "backend/loadEnv.js": "Charge les variables d'environnement avant le demarrage du backend.",
        "src/App.js": "Point central du frontend React. Gere session, roles et routes principales.",
        "src/services/api.js": "Client API du frontend. Centralise fetch, tokens, erreurs, cache et upload fichier.",
        "src/index.js": "Point d'entree React qui monte l'application dans la page HTML.",
        "src/main.jsx": "Entree alternative React selon la configuration du projet.",
        "public/index.html": "Page HTML racine dans laquelle React s'affiche.",
        "package.json": "Configuration npm principale du frontend: scripts, dependances et proxy backend.",
        "backend/package.json": "Configuration npm du backend: scripts serveur, tests et dependances Node.",
        "docker-compose.yml": "Orchestration Docker globale pour lancer les services du projet.",
        "backend/docker-compose.yml": "Orchestration Docker specifique backend ou base de donnees.",
        "Dockerfile.web": "Image Docker pour construire ou servir l'application web.",
        "backend/Dockerfile": "Image Docker du serveur backend.",
        ".env": "Variables locales sensibles: secrets, ports, connexions. Ne pas publier.",
        ".env.example": "Exemple de variables d'environnement sans secrets reels.",
        ".gitignore": "Liste des fichiers ignores par Git.",
        ".dockerignore": "Liste des fichiers ignores pendant la construction Docker.",
    }
    if p in exact:
        return exact[p]

    if p.startswith(".github/"):
        return "Configuration GitHub: workflows, automatisations ou regles du depot."
    if p.startswith("backend/routes/"):
        route = name.replace(".js", "")
        return f"Route REST backend pour le domaine '{route}'. Recoit les appels /api et renvoie des reponses JSON."
    if p.startswith("backend/models/"):
        model = name.replace(".js", "")
        return f"Modele Mongoose '{model}'. Definit la structure MongoDB et les champs stockes."
    if p.startswith("backend/middlewares/"):
        return "Middleware backend. Controle ou enrichit les requetes avant les routes."
    if p.startswith("backend/services/"):
        return "Service backend. Contient une logique metier reutilisable par plusieurs routes."
    if p.startswith("backend/utils/"):
        return "Utilitaire backend. Fournit de petites fonctions partagees."
    if p.startswith("backend/constants/"):
        return "Constantes backend: roles, permissions, codes erreur ou regles metier."
    if p.startswith("backend/scripts/"):
        return "Script backend de maintenance, test, seed, migration ou import de donnees."
    if p.startswith("backend/ai_py/"):
        return "Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable."
    if p.startswith("backend/docs/"):
        return "Documentation technique backend ou checklist operationnelle."
    if p.startswith("backend/data/ai/"):
        return "Dataset IA utilise pour entrainement, test ou export des modeles."

    if p.startswith("src/pages/admin/"):
        return "Page React pour l'espace administrateur."
    if p.startswith("src/pages/magasinier/"):
        return "Page React pour l'espace magasinier."
    if p.startswith("src/pages/responsable/fournisseurs/"):
        return "Page React du module fournisseurs responsable."
    if p.startswith("src/pages/responsable/commandes/"):
        return "Page React du module commandes fournisseurs."
    if p.startswith("src/pages/responsable/"):
        return "Page React pour l'espace responsable."
    if p.startswith("src/pages/demandeur/"):
        return "Page React pour l'espace demandeur."
    if p.startswith("src/pages/supplier/"):
        return "Page React du portail fournisseur."
    if p.startswith("src/components/shared/"):
        return "Composant React partage entre plusieurs pages."
    if p.startswith("src/components/admin/"):
        return "Composant React propre a l'administration."
    if p.startswith("src/components/magasinier/"):
        return "Composant React propre au magasinier."
    if p.startswith("src/components/responsable/"):
        return "Composant React propre au responsable."
    if p.startswith("src/components/demandeur/"):
        return "Composant React propre au demandeur."
    if p.startswith("src/components/fournisseurs/"):
        return "Composant React du module fournisseurs."
    if p.startswith("src/components/parametres/"):
        return "Composant React des parametres et regles de stock."
    if p.startswith("src/services/"):
        return "Service frontend. Appelle l'API ou organise une logique partagee cote React."
    if p.startswith("src/hooks/"):
        return "Hook React reutilisable."
    if p.startswith("src/utils/"):
        return "Utilitaire frontend partage."
    if p.startswith("src/constants/"):
        return "Constantes frontend: roles, permissions ou valeurs fixes."
    if p.startswith("src/data/"):
        return "Donnees mock ou donnees locales de demonstration."
    if p.startswith("src/assets/"):
        return "Ressource visuelle importee dans React."

    if p.startswith("frontend/"):
        return "Ancienne ou deuxieme copie frontend. A verifier avant suppression car elle peut servir d'archive ou de reference."
    if p.startswith("mobile/pfe-sentinel-mobile/src/app/screens/"):
        return "Ecran de l'application mobile."
    if p.startswith("mobile/pfe-sentinel-mobile/src/core/services/"):
        return "Service mobile pour parler avec API, stockage ou appareil."
    if p.startswith("mobile/pfe-sentinel-mobile/src/core/db/"):
        return "Couche base locale mobile."
    if p.startswith("mobile/pfe-sentinel-mobile/src/ui/"):
        return "Composant UI mobile reutilisable."
    if p.startswith("mobile/pfe-sentinel-mobile/"):
        return "Configuration ou fichier racine de l'application mobile."

    if p.startswith("public/catalogue/"):
        return "Image ou fichier public du catalogue visuel."
    if p.startswith("public/"):
        return "Fichier public servi directement par le frontend."
    if p.startswith("docker/"):
        return "Configuration Docker ou Nginx."
    if p.startswith("docs/"):
        return "Documentation ou artefact de rapport du projet."
    if p.startswith("tools/"):
        return "Outil local pour developpement, generation ou service du build."

    if suffix == ".css":
        return "Fichier CSS qui gere le style visuel d'une page ou d'un composant."
    if suffix in {".test.js", ".test.jsx", ".test.ts", ".test.tsx"}:
        return "Test automatise."
    if suffix in {".md", ".txt"}:
        return "Documentation texte."
    if suffix in {".png", ".svg", ".ico"}:
        return "Asset visuel."
    return "Fichier du projet a garder sauf verification contraire."


def section_for(path: str) -> str:
    if path.startswith("backend/"):
        return "Backend"
    if path.startswith("src/"):
        return "Frontend principal"
    if path.startswith("frontend/"):
        return "Frontend secondaire ou ancien"
    if path.startswith("mobile/"):
        return "Mobile"
    if path.startswith("public/"):
        return "Public"
    if path.startswith("docs/"):
        return "Documentation"
    if path.startswith("docker/"):
        return "Docker"
    if path.startswith("tools/"):
        return "Outils"
    if path.startswith(".github/"):
        return "GitHub"
    return "Racine"


def cleanup_note(path: str) -> str:
    p = path.replace("\\", "/")
    if p in {
        "tmp_frontend.err.log",
        "tmp_frontend.log",
        "tmp_frontend_node.err.log",
        "tmp_frontend_node.out.log",
    }:
        return "Candidat nettoyage: log temporaire, supprimable si non utilise pour diagnostic."
    if p.startswith("frontend/"):
        return "A verifier: possible doublon ancien du frontend principal. Ne pas supprimer sans validation."
    if p in {"backend/tmp-list-users.js", "backend/tmp-list-products.js"}:
        return "A verifier: script temporaire de diagnostic. Peut etre archive ou supprime apres confirmation."
    if p.endswith(".md") and p.startswith("backend/docs/"):
        return "Documentation utile pour comprendre le backend. A garder."
    if p.startswith("docs/") and p.endswith(".zip"):
        return "Donnee volumineuse. Garder si elle sert aux imports ou au rapport."
    return ""


def collect_files():
    files = []
    for path in ROOT.rglob("*"):
      if path.is_file() and not should_skip(path):
          files.append(rel(path))
    return sorted(files, key=lambda x: (section_for(x), x.lower()))


def write_markdown(rows):
    cleanup_rows = [row for row in rows if row["cleanup"]]
    lines = [
        "# Inventaire des fichiers - PFE SENTINEL",
        "",
        f"Genere le {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "Dossiers exclus car generes ou techniques: .git, node_modules, build, .cache, .semgrep, .sixth.",
        "",
        "## Fichiers commentes directement dans le code",
        "",
        "- backend/server.js",
        "- backend/db.js",
        "- backend/routes/auth.js",
        "- backend/routes/products.js",
        "- src/App.js",
        "- src/services/api.js",
        "",
        "## Nettoyage propose",
        "",
        "Je n'ai rien supprime automatiquement. Les fichiers ci-dessous demandent une verification avant suppression.",
        "",
        "| Chemin | Recommandation |",
        "|---|---|",
    ]
    for row in cleanup_rows:
        lines.append(f"| `{row['path']}` | {row['cleanup']} |")
    lines.extend([
        "",
        "## Inventaire complet",
        "",
        "| Section | Chemin | Type | Role simple | Nettoyage |",
        "|---|---|---|---|---|",
    ])
    for row in rows:
        lines.append(
            f"| {row['section']} | `{row['path']}` | {row['kind']} | {row['role']} | {row['cleanup']} |"
        )
    MD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def add_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.grey)
    canvas.drawString(1.4 * cm, 0.9 * cm, "PFE SENTINEL - Inventaire des fichiers")
    canvas.drawRightString(19.6 * cm, 0.9 * cm, f"Page {doc.page}")
    canvas.restoreState()


def write_pdf(rows):
    cleanup_rows = [row for row in rows if row["cleanup"]]
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontSize=7,
        leading=9,
        wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        name="SmallBold",
        parent=styles["BodyText"],
        fontSize=7,
        leading=9,
        fontName="Helvetica-Bold",
        wordWrap="CJK",
    ))

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.4 * cm,
    )

    story = []
    story.append(Paragraph("Inventaire des fichiers - PFE SENTINEL", styles["Title"]))
    story.append(Paragraph(f"Genere le {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["BodyText"]))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph(
        "Ce document explique chaque fichier applicatif detecte dans le projet. "
        "Les dossiers generes ou techniques exclus sont: .git, node_modules, build, .cache, .semgrep, .sixth.",
        styles["BodyText"],
    ))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Fichiers commentes directement dans le code", styles["Heading2"]))
    for item in [
        "backend/server.js",
        "backend/db.js",
        "backend/routes/auth.js",
        "backend/routes/products.js",
        "src/App.js",
        "src/services/api.js",
    ]:
        story.append(Paragraph(f"- {item}", styles["BodyText"]))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Regle de nettoyage", styles["Heading2"]))
    story.append(Paragraph(
        "Je n'ai pas supprime automatiquement les fichiers de code: certains semblent anciens ou temporaires, "
        "mais une suppression sans validation peut casser une page, un test, un import ou une soutenance.",
        styles["BodyText"],
    ))
    if cleanup_rows:
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph("Nettoyage propose apres verification", styles["Heading2"]))
        cleanup_table = [[
            Paragraph("Chemin", styles["SmallBold"]),
            Paragraph("Recommandation", styles["SmallBold"]),
        ]]
        for row in cleanup_rows[:120]:
            cleanup_table.append([
                Paragraph(row["path"], styles["Small"]),
                Paragraph(row["cleanup"], styles["Small"]),
            ])
        cleanup = Table(cleanup_table, colWidths=[7.0 * cm, 9.8 * cm], repeatRows=1)
        cleanup.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9EEF5")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ]))
        story.append(cleanup)
    story.append(PageBreak())

    current_section = None
    for index, row in enumerate(rows):
        if row["section"] != current_section:
            if current_section is not None:
                story.append(Spacer(1, 0.2 * cm))
            current_section = row["section"]
            story.append(Paragraph(current_section, styles["Heading2"]))
            table_data = [[
                Paragraph("Chemin", styles["SmallBold"]),
                Paragraph("Type", styles["SmallBold"]),
                Paragraph("Role simple", styles["SmallBold"]),
                Paragraph("Nettoyage", styles["SmallBold"]),
            ]]
        table_data.append([
            Paragraph(row["path"], styles["Small"]),
            Paragraph(row["kind"], styles["Small"]),
            Paragraph(row["role"], styles["Small"]),
            Paragraph(row["cleanup"] or "-", styles["Small"]),
        ])

        next_index = index + 1
        next_section = rows[next_index]["section"] if next_index < len(rows) else None
        if next_section != current_section:
            table = Table(table_data, colWidths=[5.1 * cm, 2.2 * cm, 6.9 * cm, 3.0 * cm], repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9EEF5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(table)
            table_data = []

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    files = collect_files()
    rows = [
        {
            "section": section_for(path),
            "path": path,
            "kind": file_kind(path),
            "role": explain(path),
            "cleanup": cleanup_note(path),
        }
        for path in files
    ]
    write_markdown(rows)
    write_pdf(rows)
    print(f"{len(rows)} fichiers inventories")
    print(PDF_PATH)
    print(MD_PATH)


if __name__ == "__main__":
    main()
