import React, { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };  // Initialise l'état pour savoir si une erreur est survenue
  }

  static getDerivedStateFromError(error) {
    // Met à jour l'état pour afficher le message d'erreur
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log l'erreur dans un service de reporting ou à la console
    console.error("Erreur capturée dans ErrorBoundary:", error);
    console.error(info);
  }

  render() {
    if (this.state.hasError) {
      // Affiche un message d'erreur générique si une erreur est capturée
      return <h1>Oups! Il y a eu une erreur dans l'application.</h1>;
    }

    // Sinon, affiche les enfants du composant ErrorBoundary
    return this.props.children;
  }
}

export default ErrorBoundary;
