import React, { type ReactNode } from "react";
import { NavigationProvider, useNavigation } from "./NavigationContext.js";
import { TaskProvider, useTask } from "./TaskContext.js";
import { NotificationProvider, useNotification } from "./NotificationContext.js";
import { CredentialProvider, useCredential } from "./CredentialContext.js";
import { ChatProvider, useChat } from "./ChatContext.js";
import type {
  NavigationFacade,
  TaskFacade,
  NotificationFacade,
  CredentialFacade,
  ChatFacade,
  View,
  CredentialField,
  NotificationType,
  Notification,
} from "./ui-types.js";

export {
  NavigationProvider,
  useNavigation,
  TaskProvider,
  useTask,
  NotificationProvider,
  useNotification,
  CredentialProvider,
  useCredential,
  ChatProvider,
  useChat,
};

export type {
  NavigationFacade,
  TaskFacade,
  NotificationFacade,
  CredentialFacade,
  ChatFacade,
  View,
  CredentialField,
  NotificationType,
  Notification,
};

function composeProviders(...providers: Array<React.FC<{ children: ReactNode }>>): React.FC<{ children: ReactNode }> {
  return providers.reduce(
    (Accumulated, Current) =>
      ({ children }: { children: ReactNode }) =>
        React.createElement(Accumulated, null, React.createElement(Current, null, children)),
  );
}

export const UIProviders = composeProviders(
  NavigationProvider,
  TaskProvider,
  NotificationProvider,
  CredentialProvider,
  ChatProvider,
);