# Inventaire des fichiers - PFE SENTINEL

Genere le 2026-06-22 00:17

Dossiers exclus car generes ou techniques: .git, node_modules, build, .cache, .semgrep, .sixth.

## Fichiers commentes directement dans le code

- backend/server.js
- backend/db.js
- backend/routes/auth.js
- backend/routes/products.js
- src/App.js
- src/services/api.js

## Nettoyage propose

Je n'ai rien supprime automatiquement. Les fichiers ci-dessous demandent une verification avant suppression.

| Chemin | Recommandation |
|---|---|
| `backend/docs/ARCHITECTURE.md` | Documentation utile pour comprendre le backend. A garder. |
| `backend/docs/BUSINESS_RULES.md` | Documentation utile pour comprendre le backend. A garder. |
| `backend/docs/ERROR_CODES.md` | Documentation utile pour comprendre le backend. A garder. |
| `backend/docs/GEMINI_API.md` | Documentation utile pour comprendre le backend. A garder. |
| `backend/docs/QR_SECURITY.md` | Documentation utile pour comprendre le backend. A garder. |
| `backend/docs/RELEASE_CHECKLIST.md` | Documentation utile pour comprendre le backend. A garder. |
| `docs/sentinel_dataset_realiste_csv.zip` | Donnee volumineuse. Garder si elle sert aux imports ou au rapport. |

## Inventaire complet

| Section | Chemin | Type | Role simple | Nettoyage |
|---|---|---|---|---|
| Backend | `backend/.dockerignore` | autre | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/.env` | configuration sensible | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/.env.example` | autre | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/.env.local` | autre | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/ai_py/00_build_features.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/01_consumption_forecast.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/02_stockout_risk_classifier.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/03_anomaly_detector.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/04_adaptive_threshold_model.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/05_behavioral_classification.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/06_operational_intelligence_score.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/07_copilot_decision_engine.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/07_copilot_decision_engine.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/_common.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/anomaly_model.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/chatbot_responsable.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/consumption_model.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/dataset_builder.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/stockout_model.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/__pycache__/train_all.cpython-314.pyc` | autre | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/_common.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/anomaly_model.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/chatbot_responsable.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/consumption_model.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/dataset_builder.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/stockout_model.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/ai_py/train_all.py` | code | Script Python IA: preparation dataset, prediction, entrainement ou chatbot responsable. |  |
| Backend | `backend/constants/errorCodes.js` | code | Constantes backend: roles, permissions, codes erreur ou regles metier. |  |
| Backend | `backend/constants/permissions.js` | code | Constantes backend: roles, permissions, codes erreur ou regles metier. |  |
| Backend | `backend/constants/roles.js` | code | Constantes backend: roles, permissions, codes erreur ou regles metier. |  |
| Backend | `backend/constants/stockRules.js` | code | Constantes backend: roles, permissions, codes erreur ou regles metier. |  |
| Backend | `backend/data/ai/adaptive_features_v20260621220643.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/adaptive_features_v20260621220643.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/anomaly_dataset_v20260621220643.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/anomaly_dataset_v20260621220643.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/consumption_dataset_20260218.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/consumption_dataset_20260218.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/consumption_dataset_v20260621220643.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/consumption_dataset_v20260621220643.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/stockout_dataset_20260218.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/stockout_dataset_20260218.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/stockout_dataset_v20260621220643.csv` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/ai/stockout_dataset_v20260621220643.jsonl` | donnee ou document | Dataset IA utilise pour entrainement, test ou export des modeles. |  |
| Backend | `backend/data/humanizedCatalogue.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/db.js` | code | Connexion MongoDB via Mongoose et fonctions d'attente de disponibilite de la base. |  |
| Backend | `backend/docker-compose.yml` | configuration | Orchestration Docker specifique backend ou base de donnees. |  |
| Backend | `backend/Dockerfile` | docker | Image Docker du serveur backend. |  |
| Backend | `backend/docs/ARCHITECTURE.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/docs/BUSINESS_RULES.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/docs/ERROR_CODES.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/docs/GEMINI_API.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/docs/QR_SECURITY.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/docs/RELEASE_CHECKLIST.md` | documentation | Documentation technique backend ou checklist operationnelle. | Documentation utile pour comprendre le backend. A garder. |
| Backend | `backend/loadEnv.js` | code | Charge les variables d'environnement avant le demarrage du backend. |  |
| Backend | `backend/middlewares/idempotencyGuard.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/perfMonitor.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/requestContext.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/requireAnyPermission.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/requireAuth.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/requirePermission.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/requireRole.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/middlewares/strictBody.js` | code | Middleware backend. Controle ou enrichit les requetes avant les routes. |  |
| Backend | `backend/models/AIAlert.js` | code | Modele Mongoose 'AIAlert'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/AIAssistantTrace.js` | code | Modele Mongoose 'AIAssistantTrace'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/AIPrediction.js` | code | Modele Mongoose 'AIPrediction'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/AIRecommendationTrace.js` | code | Modele Mongoose 'AIRecommendationTrace'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/AppSetting.js` | code | Modele Mongoose 'AppSetting'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Category.js` | code | Modele Mongoose 'Category'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/ChatConversation.js` | code | Modele Mongoose 'ChatConversation'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/ChatMessage.js` | code | Modele Mongoose 'ChatMessage'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/DecisionAssignment.js` | code | Modele Mongoose 'DecisionAssignment'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/DecisionResolution.js` | code | Modele Mongoose 'DecisionResolution'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/FifoScanAudit.js` | code | Modele Mongoose 'FifoScanAudit'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/History.js` | code | Modele Mongoose 'History'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/IdempotencyKey.js` | code | Modele Mongoose 'IdempotencyKey'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Inventory.js` | code | Modele Mongoose 'Inventory'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/InventoryCount.js` | code | Modele Mongoose 'InventoryCount'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/InventoryLine.js` | code | Modele Mongoose 'InventoryLine'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/InventorySession.js` | code | Modele Mongoose 'InventorySession'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Laboratory.js` | code | Modele Mongoose 'Laboratory'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Location.js` | code | Modele Mongoose 'Location'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Notification.js` | code | Modele Mongoose 'Notification'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/PasswordReset.js` | code | Modele Mongoose 'PasswordReset'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Product.js` | code | Modele Mongoose 'Product'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/PurchaseOrder.js` | code | Modele Mongoose 'PurchaseOrder'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Request.js` | code | Modele Mongoose 'Request'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SecurityAudit.js` | code | Modele Mongoose 'SecurityAudit'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Sequence.js` | code | Modele Mongoose 'Sequence'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/StockEntry.js` | code | Modele Mongoose 'StockEntry'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/StockExit.js` | code | Modele Mongoose 'StockExit'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/StockLot.js` | code | Modele Mongoose 'StockLot'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/StockRule.js` | code | Modele Mongoose 'StockRule'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/Supplier.js` | code | Modele Mongoose 'Supplier'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SupplierAlert.js` | code | Modele Mongoose 'SupplierAlert'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SupplierHistory.js` | code | Modele Mongoose 'SupplierHistory'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SupplierProduct.js` | code | Modele Mongoose 'SupplierProduct'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SupportTicket.js` | code | Modele Mongoose 'SupportTicket'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/SyncEvent.js` | code | Modele Mongoose 'SyncEvent'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/User.js` | code | Modele Mongoose 'User'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/models/UserSession.js` | code | Modele Mongoose 'UserSession'. Definit la structure MongoDB et les champs stockes. |  |
| Backend | `backend/package-lock.json` | configuration | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/package.json` | configuration | Configuration npm du backend: scripts serveur, tests et dependances Node. |  |
| Backend | `backend/README.md` | documentation | Documentation texte. |  |
| Backend | `backend/reset-demandeur.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/reset-known-passwords.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/routes/admin-support.js` | code | Route REST backend pour le domaine 'admin-support'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/admin.js` | code | Route REST backend pour le domaine 'admin'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/ai.js` | code | Route REST backend pour le domaine 'ai'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/auth.js` | code | Route REST backend pour le domaine 'auth'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/categories.js` | code | Route REST backend pour le domaine 'categories'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/chat.js` | code | Route REST backend pour le domaine 'chat'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/feed.js` | code | Route REST backend pour le domaine 'feed'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/files.js` | code | Route REST backend pour le domaine 'files'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/history.js` | code | Route REST backend pour le domaine 'history'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/inventory.js` | code | Route REST backend pour le domaine 'inventory'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/laboratories.js` | code | Route REST backend pour le domaine 'laboratories'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/locations.js` | code | Route REST backend pour le domaine 'locations'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/notifications.js` | code | Route REST backend pour le domaine 'notifications'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/products.js` | code | Route REST backend pour le domaine 'products'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/purchase-orders.js` | code | Route REST backend pour le domaine 'purchase-orders'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/reports.js` | code | Route REST backend pour le domaine 'reports'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/requests.js` | code | Route REST backend pour le domaine 'requests'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/security-audit.js` | code | Route REST backend pour le domaine 'security-audit'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/settings.js` | code | Route REST backend pour le domaine 'settings'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/stock.js` | code | Route REST backend pour le domaine 'stock'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/supplier-alerts.js` | code | Route REST backend pour le domaine 'supplier-alerts'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/supplier-portal.js` | code | Route REST backend pour le domaine 'supplier-portal'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/suppliers.js` | code | Route REST backend pour le domaine 'suppliers'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/support.js` | code | Route REST backend pour le domaine 'support'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/sync.js` | code | Route REST backend pour le domaine 'sync'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/routes/users.js` | code | Route REST backend pour le domaine 'users'. Recoit les appels /api et renvoie des reponses JSON. |  |
| Backend | `backend/scripts/ai-setup-check.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/backfill-request-fields.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/backfill-user-timestamps.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/cleanup-demo-data.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/demo-setup.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/export-ai-dataset.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/generate-catalogue-etap-etendu.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/import-catalogue-etap.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/import-realistic-sentinel-dataset.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/migrate-request-statuses.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/seed-inventory-demo.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/seed-magasinier-large-data.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/test-ai-chatbot-config.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/test-auth-recovery-flow.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/test-critical-flow.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/test-guardrails.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/test-stock-product-flow.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/scripts/verify-humanized-data.js` | code | Script backend de maintenance, test, seed, migration ou import de donnees. |  |
| Backend | `backend/seed-human-users.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/seed-roles-real.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/seed-user.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/server.js` | code | Point d'entree du backend Express. Configure securite, middlewares, routes REST et demarrage serveur. |  |
| Backend | `backend/services/adminIncidentService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/adminMailDigestService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/aiGovernanceService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/aiModelService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/alertService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/domainCleanupService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/geminiService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/groqService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/mailerService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/mailQueueService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/mailTemplates.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/mobileSyncService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/perfMonitorService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/purchaseOrderReminderJob.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/purchaseOrderSupplierMailService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/qrTokenService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/rbacPolicyService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/securityAuditService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/stockRulesService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/supplierPortalTokenService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/supplierRegistryService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/transactionService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/services/userPreferencesService.js` | code | Service backend. Contient une logique metier reutilisable par plusieurs routes. |  |
| Backend | `backend/update-email.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1771327158617-24c23b43-b3cb-4f6b-b225-61f15d662ad8.jpg` | image ou icone | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1771337623922-10ecf959-50df-460c-95dd-c4e7a785fb51.jpeg` | image ou icone | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1771337631234-3fe35501-ba6c-426a-ab59-28ecf7bb5515.jpeg` | image ou icone | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1771620899149-d65ccc9d-0d5e-444c-9bbf-bd1f791572a2.jpg` | image ou icone | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1774430716810-fda27ca3-0daf-4f36-b84d-d3ac72b0bb9e.jpg` | image ou icone | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1776247008233-1d1c8c3b-f947-4d36-b90d-221052d55ac5.png` | image ou icone | Asset visuel. |  |
| Backend | `backend/uploads/1776763101900-5ed63493-d552-49ab-8eed-d9ff0f1c0b57.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1778180471025-8a498496-d313-484e-8c89-105679bdb096.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1778234965112-05c62573-8118-4bed-8dd1-ee10af6121f4.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1778234974756-5e92f840-7d74-49d4-94af-76123e0c1091.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1778234986718-3c100568-172c-4ca6-a499-3fb2323d6dd4.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1778590140250-b26cdb87-34da-4ab9-abf8-1d015ccb6e43.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1779566228438-300059d9-0e18-4cca-8aa3-8415cfc8122c.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/1782064300086-db1750ef-e91f-45cb-a5ea-163b57e7c66b.pdf` | donnee ou document | Fichier du projet a garder sauf verification contraire. |  |
| Backend | `backend/uploads/avatar-1779459485505-b3495089-b8fc-4f7f-ada3-1172cf387aec.png` | image ou icone | Asset visuel. |  |
| Backend | `backend/uploads/avatar-1779693823697-04ac5610-84ed-418a-a1b9-9f9d97e2a22e.png` | image ou icone | Asset visuel. |  |
| Backend | `backend/uploads/avatar-1781695821576-c87ab15a-9ae9-49fc-b9d2-32f12699d600.png` | image ou icone | Asset visuel. |  |
| Backend | `backend/uploads/avatar-1781859098845-53bf141b-9f8f-4211-9bb8-9973fffc8ac5.png` | image ou icone | Asset visuel. |  |
| Backend | `backend/utils/fileSecurity.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Backend | `backend/utils/logger.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Backend | `backend/utils/privacy.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Backend | `backend/utils/requestStatus.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Backend | `backend/utils/sessionPolicy.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Backend | `backend/utils/validation.js` | code | Utilitaire backend. Fournit de petites fonctions partagees. |  |
| Docker | `docker/nginx/default.conf` | configuration | Configuration Docker ou Nginx. |  |
| Documentation | `docs/catalogue_produits_petrolier_etap_humanise.csv` | donnee ou document | Documentation ou artefact de rapport du projet. |  |
| Documentation | `docs/guide-comprehension-3-jours.md` | documentation | Documentation ou artefact de rapport du projet. |  |
| Documentation | `docs/inventaire-fichiers-pfe-sentinel.md` | documentation | Documentation ou artefact de rapport du projet. |  |
| Documentation | `docs/inventaire-fichiers-pfe-sentinel.pdf` | donnee ou document | Documentation ou artefact de rapport du projet. |  |
| Documentation | `docs/sentinel_dataset_realiste_csv.zip` | donnee ou document | Documentation ou artefact de rapport du projet. | Donnee volumineuse. Garder si elle sert aux imports ou au rapport. |
| Documentation | `docs/~$talogue_produits_petrolier_etap_exemples.rtf` | autre | Documentation ou artefact de rapport du projet. |  |
| Frontend principal | `src/App.css` | style | Fichier CSS qui gere le style visuel d'une page ou d'un composant. |  |
| Frontend principal | `src/App.js` | code | Point central du frontend React. Gere session, roles et routes principales. |  |
| Frontend principal | `src/App.test.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/assets/logoETAP.png` | image ou icone | Ressource visuelle importee dans React. |  |
| Frontend principal | `src/components/admin/SidebarAdmin.css` | style | Composant React propre a l'administration. |  |
| Frontend principal | `src/components/admin/SidebarAdmin.jsx` | code | Composant React propre a l'administration. |  |
| Frontend principal | `src/components/demandeur/SidebarDem.css` | style | Composant React propre au demandeur. |  |
| Frontend principal | `src/components/demandeur/SidebarDem.jsx` | code | Composant React propre au demandeur. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurAlertCenter.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurCard.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurDetailsHeader.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurDocumentsPanel.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurEvaluationPanel.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurFilters.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurForm.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurNotificationModal.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurOrdersPreview.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurRecommendationPanel.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/fournisseurs.css` | style | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseursTable.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurStatsCards.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurTabs.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/fournisseurs/FournisseurTimeline.jsx` | code | Composant React du module fournisseurs. |  |
| Frontend principal | `src/components/magasinier/ForgotPassword.css` | style | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/ForgotPassword.jsx` | code | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/LoginMag.css` | style | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/LoginMag.jsx` | code | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/SidebarMag.css` | style | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/SidebarMag.jsx` | code | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/SplashScreen.css` | style | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/magasinier/SplashScreen.jsx` | code | Composant React propre au magasinier. |  |
| Frontend principal | `src/components/parametres/ApplyGlobalThresholdModal.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockAlertRulesCard.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockRulesGeneralCard.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockRulesHistory.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockRulesImpactPreview.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/stockRulesSettings.css` | style | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockRulesSettings.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockRulesSimulationModal.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/StockValidationRulesCard.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/SupportItTickets.css` | style | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/parametres/SupportItTickets.jsx` | code | Composant React des parametres et regles de stock. |  |
| Frontend principal | `src/components/responsable/SidebarResp.css` | style | Composant React propre au responsable. |  |
| Frontend principal | `src/components/responsable/SidebarResp.jsx` | code | Composant React propre au responsable. |  |
| Frontend principal | `src/components/shared/AppTable.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/AppTable.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ConfirmDialog.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ConfirmDialog.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ForgotPassword.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ForgotPassword.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HeaderMag.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HeaderMag.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HeaderPage.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HeaderPage.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HistoryTable.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HistoryTable.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HoverCard.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HoverCard.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/HoverCardExamples.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/InlineQrScanner.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/InlineQrScanner.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LoadingSpinner.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LoadingSpinner.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LoginPage.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LoginPage.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LogoHeader.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/LogoHeader.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ProduitsMag.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ProduitsMag.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ProtectedImage.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ProtectedPage.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/ProtectedWrapper.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/QrReader.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/SidebarMag.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/SidebarMag.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/SplashScreen.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/SplashScreen.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/StockModal.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/StockModal.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/Toast.css` | style | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/components/shared/Toast.jsx` | code | Composant React partage entre plusieurs pages. |  |
| Frontend principal | `src/constants/permissions.js` | code | Constantes frontend: roles, permissions ou valeurs fixes. |  |
| Frontend principal | `src/constants/roles.js` | code | Constantes frontend: roles, permissions ou valeurs fixes. |  |
| Frontend principal | `src/data/catalogueFallback.js` | code | Donnees mock ou donnees locales de demonstration. |  |
| Frontend principal | `src/ErrorBoundary.jsx` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/hooks/useIsMobile.js` | code | Hook React reutilisable. |  |
| Frontend principal | `src/hooks/useProtectedFileUrl.js` | code | Hook React reutilisable. |  |
| Frontend principal | `src/hooks/useTheme.js` | code | Hook React reutilisable. |  |
| Frontend principal | `src/index.css` | style | Fichier CSS qui gere le style visuel d'une page ou d'un composant. |  |
| Frontend principal | `src/index.js` | code | Point d'entree React qui monte l'application dans la page HTML. |  |
| Frontend principal | `src/logo.svg` | image ou icone | Asset visuel. |  |
| Frontend principal | `src/main.jsx` | code | Entree alternative React selon la configuration du projet. |  |
| Frontend principal | `src/pages/admin/AdminAudit.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminAudit.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminDashboard.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminDashboard.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminIA.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminIA.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminRbac.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminRbac.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSecurity.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSecurity.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSessions.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSessions.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSettings.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSettings.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSupport.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminSupport.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminUsers.css` | style | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/admin/AdminUsers.jsx` | code | Page React pour l'espace administrateur. |  |
| Frontend principal | `src/pages/demandeur/MesDemandes.css` | style | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/demandeur/MesDemandes.jsx` | code | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/demandeur/ParametresDem.css` | style | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/demandeur/ParametresDem.jsx` | code | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/demandeur/ProduitsDem.css` | style | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/demandeur/ProduitsDem.jsx` | code | Page React pour l'espace demandeur. |  |
| Frontend principal | `src/pages/magasinier/AjouterProduit.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/AjouterProduit.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/AuditFifoMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/AuditFifoMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ChatMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ChatMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/EntreeStock.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/EntreeStock.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/FeuilleInventaireMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/FeuilleInventaireMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/HistoriqueMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/HistoriqueMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/InboxMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/InboxMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/InventaireMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/InventaireMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ListeDemandes.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ListeDemandes.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ParametresMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ParametresMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ProduitsMag.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/ProduitsMag.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/SortieStock.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/SortieStock.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/VoirDetails.css` | style | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/magasinier/VoirDetails.jsx` | code | Page React pour l'espace magasinier. |  |
| Frontend principal | `src/pages/NotFound.jsx` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/pages/responsable/AlertesIA.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/AlertesIA.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/AnalyseInventaireResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/AnalyseInventaireResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/AnalyseResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/AnalyseResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/BeneficiairePanel.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/BeneficiairePanel.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/CategoriesResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/CategoriesResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ChatbotResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ChatbotResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ChatResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ChatResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/commandes/CommandeFournisseurDetailsPage.jsx` | code | Page React du module commandes fournisseurs. |  |
| Frontend principal | `src/pages/responsable/commandes/NouvelleCommandeFournisseurPage.jsx` | code | Page React du module commandes fournisseurs. |  |
| Frontend principal | `src/pages/responsable/ConsommationResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ConsommationResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/DashboardResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/DashboardResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/DemandesAValider.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/DemandesAValider.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/FluxResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/FluxResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FicheFournisseurPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseurCommandesPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseurDocumentsPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseurEvaluationPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseurIncidentsPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseurProduitsPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/FournisseursPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/ModifierFournisseurPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/fournisseurs/NouveauFournisseurPage.jsx` | code | Page React du module fournisseurs responsable. |  |
| Frontend principal | `src/pages/responsable/FournisseursResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/FournisseursResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/HistoriqueResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/HistoriqueResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/InventairesAValiderResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/InventairesAValiderResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/InventairesResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/InventairesResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/LancerInventaireResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/LancerInventaireResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/parametres/ParametresPage.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ParametresResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ParametresResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/PilotageResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/PilotageResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ProduitsResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ProduitsResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/RegistreChimique.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/RegistreChimique.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ReglesStock.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/ReglesStock.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/SurveillanceResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/SurveillanceResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/TransactionsResp.css` | style | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/responsable/TransactionsResp.jsx` | code | Page React pour l'espace responsable. |  |
| Frontend principal | `src/pages/RoleSelection.css` | style | Fichier CSS qui gere le style visuel d'une page ou d'un composant. |  |
| Frontend principal | `src/pages/RoleSelection.jsx` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/pages/supplier/SupplierPortal.css` | style | Page React du portail fournisseur. |  |
| Frontend principal | `src/pages/supplier/SupplierPortal.jsx` | code | Page React du portail fournisseur. |  |
| Frontend principal | `src/reportWebVitals.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/services/api.js` | code | Client API du frontend. Centralise fetch, tokens, erreurs, cache et upload fichier. |  |
| Frontend principal | `src/services/api.test.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/fournisseurAlertService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/fournisseurAuditService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/fournisseurLocalStore.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/fournisseurRecommendationService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/fournisseurService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/stockRulesAuditService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/stockRulesImpactService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/stockRulesService.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/uiError.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/services/uiError.test.js` | code | Service frontend. Appelle l'API ou organise une logique partagee cote React. |  |
| Frontend principal | `src/setupTests.js` | code | Fichier du projet a garder sauf verification contraire. |  |
| Frontend principal | `src/styles/darkModeCompatibility.css` | style | Fichier CSS qui gere le style visuel d'une page ou d'un composant. |  |
| Frontend principal | `src/utils/chemicalRegister.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/demandeurI18n.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/formGuards.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/jwt.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/jwt.test.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/recentInputs.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/requestStatus.js` | code | Utilitaire frontend partage. |  |
| Frontend principal | `src/utils/uiLanguage.js` | code | Utilitaire frontend partage. |  |
| GitHub | `.github/modernize/code-migration/.gitignore` | autre | Configuration GitHub: workflows, automatisations ou regles du depot. |  |
| GitHub | `.github/modernize/code-migration/20260519192059/plan.md` | documentation | Configuration GitHub: workflows, automatisations ou regles du depot. |  |
| GitHub | `.github/modernize/code-migration/20260519192059/progress.md` | documentation | Configuration GitHub: workflows, automatisations ou regles du depot. |  |
| GitHub | `.github/workflows/backend-ci.yml` | configuration | Configuration GitHub: workflows, automatisations ou regles du depot. |  |
| Mobile | `mobile/pfe-sentinel-mobile/.expo/devices.json` | configuration | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/.expo/README.md` | documentation | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/.gitignore` | autre | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/app.json` | configuration | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/App.tsx` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/index.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/package-lock.json` | configuration | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/package.json` | configuration | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/README.md` | documentation | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/SCREENS.md` | documentation | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/App.tsx` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/lib/productDisplay.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/CatalogScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/DashboardScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/HistoryScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/HseSheetScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/InventoryScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/LocationsScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/LoginScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/MissionScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/OutboxDetailScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/OutboxScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/ProductScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/ScanScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/SettingsScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/SignatureScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/SplashScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/StockInScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/app/screens/StockOutScreen.tsx` | code | Ecran de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/db/db.ts` | code | Couche base locale mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/db/locationsRepo.ts` | code | Couche base locale mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/db/outboxRepo.ts` | code | Couche base locale mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/db/productsRepo.ts` | code | Couche base locale mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/device/deviceInfo.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/apiClient.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/authService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/fdsService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/locationsService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/photoService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/productsService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/services/syncService.ts` | code | Service mobile pour parler avec API, stockage ou appareil. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/session/sessionStore.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/settings/settingsStore.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/settings/syncStateStore.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/core/stock/stockOutDraft.ts` | code | Configuration ou fichier racine de l'application mobile. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/Button.tsx` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/Card.tsx` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/HeaderAction.tsx` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/Input.tsx` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/Screen.tsx` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/src/ui/theme.ts` | code | Composant UI mobile reutilisable. |  |
| Mobile | `mobile/pfe-sentinel-mobile/tsconfig.json` | configuration | Configuration ou fichier racine de l'application mobile. |  |
| Outils | `tools/generate_file_inventory_report.py` | code | Outil local pour developpement, generation ou service du build. |  |
| Outils | `tools/serve-build-proxy.js` | code | Outil local pour developpement, generation ou service du build. |  |
| Public | `public/catalogue/bureautique.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/default.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/gaz-techniques.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/hse.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/laboratoire.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/maintenance.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/operationnel.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/produit-chimique.svg` | image ou icone | Image ou fichier public du catalogue visuel. |  |
| Public | `public/catalogue/README.txt` | documentation | Image ou fichier public du catalogue visuel. |  |
| Public | `public/favicon.ico` | image ou icone | Fichier public servi directement par le frontend. |  |
| Public | `public/index.html` | autre | Page HTML racine dans laquelle React s'affiche. |  |
| Public | `public/logo192.png` | image ou icone | Fichier public servi directement par le frontend. |  |
| Public | `public/logo512.png` | image ou icone | Fichier public servi directement par le frontend. |  |
| Public | `public/manifest.json` | configuration | Fichier public servi directement par le frontend. |  |
| Public | `public/robots.txt` | documentation | Fichier public servi directement par le frontend. |  |
| Public | `public/sentinel-etap-icon.png` | image ou icone | Fichier public servi directement par le frontend. |  |
| Racine | `.dockerignore` | autre | Liste des fichiers ignores pendant la construction Docker. |  |
| Racine | `.env` | configuration sensible | Variables locales sensibles: secrets, ports, connexions. Ne pas publier. |  |
| Racine | `.env.docker.example` | autre | Fichier du projet a garder sauf verification contraire. |  |
| Racine | `.env.example` | autre | Exemple de variables d'environnement sans secrets reels. |  |
| Racine | `.gitignore` | autre | Liste des fichiers ignores par Git. |  |
| Racine | `.vscode/settings.json` | configuration | Fichier du projet a garder sauf verification contraire. |  |
| Racine | `docker-compose.yml` | configuration | Orchestration Docker globale pour lancer les services du projet. |  |
| Racine | `Dockerfile.web` | docker | Image Docker pour construire ou servir l'application web. |  |
| Racine | `package-lock.json` | configuration | Fichier du projet a garder sauf verification contraire. |  |
| Racine | `package.json` | configuration | Configuration npm principale du frontend: scripts, dependances et proxy backend. |  |
| Racine | `README.md` | documentation | Documentation texte. |  |
