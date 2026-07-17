const fs = require('fs');
const path = require('path');

const translations = {
  // Common terms
  'Active Sessions': 'Sessions Actives',
  'New Check-in': 'Nouvel enregistrement',
  'Entry Time': "Heure d'entrée",
  'Check Out': 'Clôturer',
  'Select Customer': 'Sélectionner un client',
  'Quick Visitor': 'Visiteur rapide',
  'Please select a customer': 'Veuillez sélectionner un client',
  'Search a customer': 'Rechercher un client',
  'Full Name': 'Nom complet',
  'Please enter visitor name': 'Veuillez entrer le nom du visiteur',
  'Visitor Name': 'Nom du visiteur',
  'Phone (Optional)': 'Téléphone (Optionnel)',
  'Phone Number': 'Numéro de téléphone',
  'Session Checkout Summary': 'Résumé de la session',
  'Confirm & Complete Checkout': 'Confirmer et Terminer',
  'Customer:': 'Client :',
  '✓ Covered by Active Subscription (Time Cost Waived)': '✓ Couvert par un abonnement actif',
  'Time Cost:': 'Coût de temps :',
  'Products Cost:': 'Coût des produits :',
  'Total Due:': 'Total à payer :',
  'Checked out successfully': 'Paiement effectué avec succès',
  'Checked in successfully': 'Enregistré avec succès',
  'Failed to calculate checkout details': 'Échec du calcul des détails de facturation',

  // Products
  'Product added successfully': 'Produit ajouté avec succès',
  'Product deleted': 'Produit supprimé',
  'Price (DT)': 'Prix (DT)',
  'Delete product': 'Supprimer le produit',
  'Are you sure to delete this product?': 'Êtes-vous sûr de vouloir supprimer ce produit ?',
  'Add Product': 'Ajouter un produit',

  // Subscriptions
  'Subscription cancelled': 'Abonnement annulé',
  'Subscription deleted': 'Abonnement supprimé',
  'Start Date': 'Date de début',
  'End Date': 'Date de fin',
  'Cancelled': 'Annulé',
  'Expired': 'Expiré',
  'Active': 'Actif',
  'Cancel subscription': "Annuler l'abonnement",
  'Are you sure you want to cancel?': 'Êtes-vous sûr de vouloir annuler ?',
  'Delete subscription': "Supprimer l'abonnement",
  'Are you sure to delete this record entirely?': 'Êtes-vous sûr de vouloir supprimer cet enregistrement ?',
  'New Subscription': 'Nouvel abonnement',
  'Cancel': 'Annuler',

  // Layout & others that might be missing
  'Logout': 'Déconnexion'
};

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      for (const [eng, fra] of Object.entries(translations)) {
        // Safe replacement for exact match inside tags or quotes
        // We do a global string replace for anything that looks like text
        // since we just want to replace literal UI texts
        const regex = new RegExp(`(?<=['">])(${eng.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")})(?=['"<])`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, fra);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'src'));
