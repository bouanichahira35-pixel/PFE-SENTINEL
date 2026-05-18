from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


@dataclass(frozen=True)
class UseCase:
    sprint: int
    title: str
    actors: str
    objective: str
    preconditions: str
    postconditions: str
    base_steps: list[str]
    exception_cases: list[str]


def _register_fonts() -> None:
    windows_fonts = Path(r"C:\Windows\Fonts")
    regular = windows_fonts / "arial.ttf"
    bold = windows_fonts / "arialbd.ttf"
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("Arial", str(regular)))
        pdfmetrics.registerFont(TTFont("Arial-Bold", str(bold)))


def _styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()

    base_font = "Arial" if "Arial" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold_font = (
        "Arial-Bold" if "Arial-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    )

    return {
        "title": ParagraphStyle(
            "Title",
            parent=styles["Title"],
            fontName=bold_font,
            fontSize=18,
            leading=22,
            spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=styles["Heading1"],
            fontName=bold_font,
            fontSize=14,
            leading=17,
            spaceBefore=8,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=styles["Heading2"],
            fontName=bold_font,
            fontSize=12,
            leading=15,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=styles["Normal"],
            fontName=bold_font,
            fontSize=10.5,
            leading=13,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName=base_font,
            fontSize=10.5,
            leading=13,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=styles["Normal"],
            fontName=base_font,
            fontSize=9.5,
            leading=12,
        ),
    }


def _table_style() -> TableStyle:
    return TableStyle(
        [
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
    )


def _numbered_list(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(text, style)) for text in items],
        bulletType="1",
        leftIndent=14,
        bulletFontSize=style.fontSize,
    )


def _bulleted_list(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(text, style)) for text in items],
        bulletType="bullet",
        leftIndent=14,
        bulletFontSize=style.fontSize,
    )


def _desc_table(
    uc: UseCase,
    table_number: str,
    styles: dict[str, ParagraphStyle],
    available_width: float,
) -> list:
    label_w = 5.0 * cm
    value_w = max(available_width - label_w, 10.0 * cm)

    header = Paragraph(
        f"<b>Table {table_number} – Description textuelle « {uc.title} »</b>", styles["small"]
    )

    rows = [
        [Paragraph("Cas d’utilisation :", styles["label"]), Paragraph(uc.title, styles["body"])],
        [Paragraph("Acteurs :", styles["label"]), Paragraph(uc.actors, styles["body"])],
        [Paragraph("Objectif :", styles["label"]), Paragraph(uc.objective, styles["body"])],
        [Paragraph("Pré-condition :", styles["label"]), Paragraph(uc.preconditions, styles["body"])],
        [
            Paragraph("Post-conditions :", styles["label"]),
            Paragraph(uc.postconditions, styles["body"]),
        ],
    ]

    t = Table(rows, colWidths=[label_w, value_w])
    t.setStyle(_table_style())
    return [header, Spacer(1, 0.2 * cm), t]


def _scenario_table(
    uc: UseCase, styles: dict[str, ParagraphStyle], available_width: float
) -> list:
    label_w = 5.0 * cm
    value_w = max(available_width - label_w, 10.0 * cm)

    base = _numbered_list(uc.base_steps, styles["body"])
    exceptions = _bulleted_list(uc.exception_cases, styles["body"])

    rows = [
        [Paragraph("Scénario de base :", styles["label"]), base],
        [Paragraph("Scénario d’exception :", styles["label"]), exceptions],
    ]

    t = Table(rows, colWidths=[label_w, value_w])
    t.setStyle(_table_style())
    return [Spacer(1, 0.35 * cm), t]


def build_pdf(output_path: Path) -> None:
    _register_fonts()
    styles = _styles()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Descriptions textuelles des cas d’utilisation — Sprints 2 à 5",
        author="PFE-SENTINEL",
    )

    available_width = A4[0] - doc.leftMargin - doc.rightMargin

    use_cases: list[UseCase] = [
        # Sprint 2
        UseCase(
            sprint=2,
            title="Ajouter un produit",
            actors="Gestionnaire de stock",
            objective="Permettre au gestionnaire d’ajouter un nouveau produit au catalogue (désignation, unité, seuil, prix, etc.).",
            preconditions="L’utilisateur est authentifié et dispose du droit de gestion du catalogue.",
            postconditions="Le produit est enregistré et apparaît dans la liste des produits actifs ; une trace d’audit est créée.",
            base_steps=[
                "Le gestionnaire accède au module <b>Catalogue</b> puis clique sur <b>Ajouter produit</b>.",
                "Le système affiche le formulaire de création (informations générales, seuil/alerte, prix, fournisseur optionnel).",
                "Le gestionnaire renseigne les champs obligatoires puis valide l’enregistrement.",
                "Le système contrôle l’unicité (référence/code) et la complétude des champs.",
                "Le produit est créé et confirmé par un message : <i>« Produit ajouté avec succès »</i>.",
            ],
            exception_cases=[
                "Champs obligatoires manquants ou format invalide (ex. prix non numérique) : le système refuse et indique les erreurs.",
                "Référence/code produit déjà existant : le système demande de corriger la référence.",
                "Droits insuffisants : accès refusé et action journalisée.",
            ],
        ),
        UseCase(
            sprint=2,
            title="Archiver un produit",
            actors="Gestionnaire de stock",
            objective="Retirer un produit du catalogue actif tout en conservant son historique (mouvements, demandes, inventaires).",
            preconditions="Le produit existe ; l’utilisateur est authentifié et autorisé ; aucune modification concurrente n’est en cours.",
            postconditions="Le produit passe à l’état <i>Archivé</i>, n’est plus sélectionnable dans les nouveaux flux ; l’historique reste consultable.",
            base_steps=[
                "Le gestionnaire ouvre la fiche d’un produit actif.",
                "Le système affiche les détails du produit et l’état courant.",
                "Le gestionnaire clique sur <b>Archiver</b> et confirme l’action.",
                "Le système vérifie les contraintes (ex. produit déjà archivé) et applique l’archivage.",
                "Confirmation affichée : <i>« Produit archivé »</i>.",
            ],
            exception_cases=[
                "Produit introuvable ou déjà archivé : le système informe l’utilisateur et annule l’opération.",
                "Produit utilisé dans une opération bloquante (ex. inventaire en cours) : le système refuse et propose de réessayer après clôture.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=2,
            title="Gérer les fournisseurs",
            actors="Gestionnaire de stock",
            objective="Créer, modifier, consulter et archiver un fournisseur afin d’assurer la traçabilité des approvisionnements.",
            preconditions="L’utilisateur est authentifié ; au moins un champ d’identification du fournisseur est disponible (raison sociale ou code).",
            postconditions="Le fournisseur est créé/modifié/archivé ; les produits associés conservent leur liaison et l’action est historisée.",
            base_steps=[
                "Le gestionnaire accède au module <b>Fournisseurs</b>.",
                "Le système affiche la liste des fournisseurs et les actions possibles (ajout, modification, archivage).",
                "Le gestionnaire saisit les informations et valide.",
                "Le système contrôle les champs (unicité du code, formats téléphone/email) puis enregistre.",
                "Le système affiche une confirmation et met à jour la liste.",
            ],
            exception_cases=[
                "Champs obligatoires manquants ou formats invalides : le système affiche les erreurs et n’enregistre pas.",
                "Code fournisseur déjà existant : le système demande une correction.",
                "Archivage impossible si le fournisseur est requis par une commande en cours : le système refuse et explique la cause.",
            ],
        ),
        # Sprint 3
        UseCase(
            sprint=3,
            title="Lancer un inventaire",
            actors="Responsable stock",
            objective="Démarrer une campagne d’inventaire sur un dépôt/magasin afin de figer la période de comptage.",
            preconditions="L’utilisateur est authentifié ; aucun inventaire <i>En cours</i> n’existe déjà pour le même dépôt.",
            postconditions="Un inventaire est créé avec l’état <i>En cours</i> ; les lignes de comptage sont générées ; les utilisateurs concernés sont notifiés.",
            base_steps=[
                "Le responsable ouvre le module <b>Inventaire</b> puis clique sur <b>Lancer inventaire</b>.",
                "Le système affiche un formulaire (dépôt, date, équipe, périmètre).",
                "Le responsable renseigne les paramètres puis confirme le lancement.",
                "Le système génère les lignes d’inventaire à partir du catalogue/stock courant.",
                "Le système marque l’inventaire <i>En cours</i> et affiche la confirmation.",
            ],
            exception_cases=[
                "Inventaire déjà en cours pour le dépôt : le système refuse et propose d’ouvrir l’inventaire existant.",
                "Paramètres incomplets : champs manquants signalés.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=3,
            title="Réaliser un inventaire (saisir comptage)",
            actors="Magasinier / Agent de comptage",
            objective="Saisir les quantités réellement comptées pour chaque produit afin de comparer avec le stock théorique.",
            preconditions="Un inventaire est <i>En cours</i> ; l’utilisateur est affecté à l’inventaire ; les produits sont listés.",
            postconditions="Les quantités comptées sont enregistrées ; l’écart est calculé ; l’avancement de l’inventaire est mis à jour.",
            base_steps=[
                "L’agent ouvre l’inventaire en cours et sélectionne une ligne produit.",
                "Le système affiche la ligne (produit, quantité théorique, champs de saisie, commentaires).",
                "L’agent saisit la quantité comptée et valide la ligne.",
                "Le système enregistre la saisie et calcule l’écart (compté − théorique).",
                "Le système affiche l’état de la ligne : <i>Compté</i>.",
            ],
            exception_cases=[
                "Quantité comptée négative ou non numérique : le système refuse et demande correction.",
                "Ligne verrouillée (clôture ou validation en cours) : le système bloque la modification.",
                "Inventaire clôturé : l’accès est en lecture seule.",
            ],
        ),
        UseCase(
            sprint=3,
            title="Prendre décision sur l’inventaire (valider / demander recompte)",
            actors="Responsable stock",
            objective="Valider les résultats de comptage ou demander un recompte en cas d’écarts anormaux.",
            preconditions="Les lignes ont été comptées ; l’inventaire est toujours <i>En cours</i> ; l’utilisateur dispose du rôle de validation.",
            postconditions="Les lignes sont marquées <i>Validées</i> ou <i>Recompte demandé</i> ; les notifications et tâches associées sont créées.",
            base_steps=[
                "Le responsable consulte le récapitulatif des écarts (filtre par seuil, catégorie, criticité).",
                "Le système affiche les lignes avec écarts et l’historique des saisies.",
                "Le responsable sélectionne une ligne (ou un lot de lignes) et choisit <b>Valider</b> ou <b>Demander recompte</b>.",
                "Le système enregistre la décision et met à jour le statut des lignes.",
                "Le système notifie l’équipe de comptage si un recompte est demandé.",
            ],
            exception_cases=[
                "Aucune ligne sélectionnée : le système demande de sélectionner au moins une ligne.",
                "Inventaire déjà validé/clôturé : la décision n’est plus modifiable.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=3,
            title="Faire une entrée produit (entrée en stock)",
            actors="Magasinier / Responsable réception",
            objective="Enregistrer une entrée en stock (réception, retour, ajustement) afin de mettre à jour le stock et la traçabilité.",
            preconditions="Le produit existe et n’est pas archivé ; l’utilisateur est authentifié ; la quantité entrée est positive.",
            postconditions="Le stock est augmenté ; un mouvement d’entrée est enregistré (date, source, quantités) ; le solde stock est recalculé.",
            base_steps=[
                "Le magasinier accède au module <b>Stock</b> puis choisit <b>Entrée produit</b>.",
                "Le système affiche un formulaire (produit, quantité, motif, référence, lot/expiration optionnels).",
                "Le magasinier renseigne les informations et valide.",
                "Le système contrôle la quantité et les champs, puis enregistre le mouvement.",
                "Confirmation affichée : <i>« Entrée enregistrée »</i> et le stock est mis à jour.",
            ],
            exception_cases=[
                "Produit archivé : le système refuse l’entrée et demande de réactiver/choisir un autre produit.",
                "Quantité invalide (0, négative, non numérique) : le système refuse et indique l’erreur.",
                "Conflit de stock (mise à jour concurrente) : le système demande de réessayer.",
            ],
        ),
        # Sprint 4
        UseCase(
            sprint=4,
            title="Créer une demande",
            actors="Demandeur (Utilisateur interne)",
            objective="Soumettre une demande de produits afin de déclencher la validation puis la préparation/servir.",
            preconditions="L’utilisateur est authentifié ; le catalogue est accessible ; au moins un produit est sélectionné avec quantité > 0.",
            postconditions="Une demande est créée avec l’état <i>En attente</i> ; un numéro de demande est attribué et une notification est envoyée au validateur.",
            base_steps=[
                "Le demandeur ouvre le module <b>Demandes</b> puis clique sur <b>Nouvelle demande</b>.",
                "Le système affiche le formulaire (produits, quantités, motif, priorité, service).",
                "Le demandeur ajoute un ou plusieurs produits et valide l’envoi.",
                "Le système vérifie la complétude puis enregistre la demande.",
                "Le système affiche le numéro de demande et l’état <i>En attente</i>.",
            ],
            exception_cases=[
                "Aucun produit sélectionné ou quantité invalide : le système refuse et met en évidence les champs concernés.",
                "Produit indisponible/non autorisé : le système empêche l’ajout et affiche un message.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=4,
            title="Valider ou refuser une demande",
            actors="Validateur (Responsable / Chef de service)",
            objective="Décider d’accepter ou de refuser une demande selon les règles (budget, stock, priorité, autorisations).",
            preconditions="La demande existe et est à l’état <i>En attente</i> ; le validateur est authentifié et autorisé.",
            postconditions="La demande passe à l’état <i>Validée</i> ou <i>Refusée</i> ; une notification est envoyée au demandeur ; la décision est historisée.",
            base_steps=[
                "Le validateur consulte la liste des demandes en attente.",
                "Le système affiche le détail d’une demande (produits, quantités, motif, priorité, disponibilité).",
                "Le validateur choisit <b>Valider</b> ou <b>Refuser</b> et saisit un commentaire si nécessaire.",
                "Le système enregistre la décision et met à jour le statut de la demande.",
                "Le système notifie le demandeur du résultat.",
            ],
            exception_cases=[
                "Demande déjà traitée : le système bloque la double validation et indique l’état actuel.",
                "Stock insuffisant pour validation totale : le système propose validation partielle ou refuse selon règle paramétrée.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=4,
            title="Servir une demande",
            actors="Magasinier / Préparateur",
            objective="Préparer et délivrer les produits d’une demande validée en décrémentant le stock et en assurant la traçabilité.",
            preconditions="La demande est <i>Validée</i> ; le stock est suffisant (ou gestion de substitution autorisée) ; l’utilisateur est autorisé.",
            postconditions="La demande passe à l’état <i>Servie</i> (ou <i>Partiellement servie</i>) ; les mouvements de sortie sont enregistrés ; le stock est mis à jour.",
            base_steps=[
                "Le magasinier ouvre la liste des demandes validées et sélectionne la demande à servir.",
                "Le système affiche les lignes à préparer (quantité demandée, stock disponible, emplacement).",
                "Le magasinier confirme les quantités servies (totales ou partielles) puis valide le service.",
                "Le système enregistre les sorties de stock et met à jour les quantités restantes.",
                "Le système clôt la demande (servie/partielle) et notifie le demandeur.",
            ],
            exception_cases=[
                "Stock insuffisant au moment du service : le système bloque ou autorise le service partiel selon paramétrage.",
                "Demande non validée : le système refuse l’action.",
                "Conflit de stock (mise à jour concurrente) : le système demande de rafraîchir et réessayer.",
            ],
        ),
        # Sprint 5 (3 cas au choix)
        UseCase(
            sprint=5,
            title="Consulter l’état du stock",
            actors="Gestionnaire de stock / Magasinier",
            objective="Consulter les quantités disponibles par produit (et éventuellement par dépôt/lot) pour piloter les réapprovisionnements.",
            preconditions="L’utilisateur est authentifié ; le catalogue contient des produits.",
            postconditions="La liste/fiche stock est affichée avec filtres ; aucune donnée n’est modifiée.",
            base_steps=[
                "L’utilisateur ouvre le module <b>Stock</b> puis <b>État du stock</b>.",
                "Le système affiche la liste des produits avec quantité disponible et seuil d’alerte.",
                "L’utilisateur filtre/recherche un produit et ouvre sa fiche.",
                "Le système affiche les détails (mouvements récents, lots, seuils).",
                "L’utilisateur peut exporter la vue si l’option est activée.",
            ],
            exception_cases=[
                "Aucun résultat pour les filtres saisis : le système affiche <i>0 résultat</i>.",
                "Droits insuffisants : accès refusé.",
            ],
        ),
        UseCase(
            sprint=5,
            title="Consulter l’historique des mouvements",
            actors="Gestionnaire de stock",
            objective="Tracer toutes les entrées/sorties/ajustements afin d’auditer le stock et expliquer les écarts.",
            preconditions="L’utilisateur est authentifié ; au moins un mouvement existe (entrée, sortie, inventaire, ajustement).",
            postconditions="L’historique est affiché (avec filtres) ; l’utilisateur peut consulter le détail d’un mouvement.",
            base_steps=[
                "Le gestionnaire ouvre <b>Historique</b> depuis le module Stock.",
                "Le système affiche les mouvements avec filtres (période, produit, type, utilisateur).",
                "Le gestionnaire applique des filtres et sélectionne un mouvement.",
                "Le système affiche le détail (avant/après, motif, pièce jointe éventuelle).",
                "Le gestionnaire exporte l’historique si nécessaire.",
            ],
            exception_cases=[
                "Période invalide (date début > date fin) : le système refuse et demande correction.",
                "Aucun mouvement trouvé : le système affiche un message informatif.",
            ],
        ),
        UseCase(
            sprint=5,
            title="Générer un rapport d’inventaire",
            actors="Responsable stock",
            objective="Générer un rapport synthétique (écarts, taux de couverture, anomalies) pour l’archivage et la prise de décision.",
            preconditions="Un inventaire existe (en cours ou clôturé) ; l’utilisateur est autorisé à consulter les rapports.",
            postconditions="Le rapport est généré (PDF/Excel selon options) et disponible au téléchargement ; une trace de génération est enregistrée.",
            base_steps=[
                "Le responsable ouvre un inventaire puis choisit <b>Rapport</b>.",
                "Le système propose les paramètres (périmètre, seuil d’écart, format).",
                "Le responsable sélectionne les options et lance la génération.",
                "Le système compile les données et produit le fichier.",
                "Le système affiche un lien de téléchargement et confirme la génération.",
            ],
            exception_cases=[
                "Inventaire introuvable ou accès non autorisé : le système refuse l’opération.",
                "Échec de génération (erreur interne) : le système affiche un message et enregistre l’incident.",
            ],
        ),
    ]

    sprint_titles = {
        2: "Sprint 2 — Catalogue produits & Fournisseurs",
        3: "Sprint 3 — Inventaire & Entrées en stock",
        4: "Sprint 4 — Cycle des demandes (création/validation/service)",
        5: "Sprint 5 — Cas complémentaires (au choix)",
    }

    story = []
    story.append(Paragraph("Descriptions textuelles des cas d’utilisation", styles["title"]))
    story.append(Paragraph("Sprints 2 à 5", styles["h1"]))
    story.append(
        Paragraph(
            f"Document généré le {datetime.now().strftime('%d/%m/%Y')}.",
            styles["body"],
        )
    )
    story.append(Spacer(1, 0.8 * cm))
    story.append(
        Paragraph(
            "Format conforme au modèle : <i>Cas d’utilisation / Acteurs / Objectif / Pré-condition / Post-conditions</i> + scénarios.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    current_sprint = None
    per_sprint_index: dict[int, int] = {}

    for uc in use_cases:
        if current_sprint != uc.sprint:
            current_sprint = uc.sprint
            per_sprint_index[current_sprint] = 0
            story.append(Paragraph(sprint_titles.get(current_sprint, f"Sprint {current_sprint}"), styles["h1"]))

        per_sprint_index[current_sprint] += 1
        table_number = f"{current_sprint}.{per_sprint_index[current_sprint]}"

        story.append(Paragraph(uc.title, styles["h2"]))
        story.extend(_desc_table(uc, table_number, styles, available_width))
        story.extend(_scenario_table(uc, styles, available_width))
        story.append(Spacer(1, 0.6 * cm))

    doc.build(story)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "descriptions_textuelles_sprints_2_5.pdf"
    build_pdf(out)
    print(f"PDF généré : {out}")

