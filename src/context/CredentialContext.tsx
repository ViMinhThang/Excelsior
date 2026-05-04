import React, { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { CredentialField, CredentialFacade } from "./ui-types.js";

const CredentialContext = createContext<CredentialFacade | undefined>(undefined);

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [credentialInput, setCredentialInput] = useState("");
  const [credentialField, setCredentialField] = useState<CredentialField>(null);

  const value = useMemo<CredentialFacade>(
    () => ({
      credentialInput,
      credentialField,
      setCredentialInput,
      setCredentialField,
    }),
    [credentialInput, credentialField]
  );

  return (
    <CredentialContext.Provider value={value}>
      {children}
    </CredentialContext.Provider>
  );
}

export function useCredential(): CredentialFacade {
  const context = useContext(CredentialContext);
  if (!context) {
    throw new Error("useCredential must be used within CredentialProvider");
  }
  return context;
}