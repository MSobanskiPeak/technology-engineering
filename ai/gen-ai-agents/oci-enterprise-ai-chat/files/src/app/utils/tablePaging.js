import { createContext } from "react";

// What the table buttons send to the agent
export const TABLE_PREVIOUS = "Previous records";
export const TABLE_NEXT = "Next records";
export const TABLE_DOWNLOAD_ALL = "Download all records";
export const TABLE_ACTION_MESSAGES = [TABLE_PREVIOUS, TABLE_NEXT, TABLE_DOWNLOAD_ALL];

// The page shown by the tables of the exchange being rendered
export const TablePageContext = createContext(1);

// Page number of each exchange, worked out from the messages so it also holds
// for reloaded chats. Anything but a table button starts a new set of results.
export function getTablePages(exchanges) {
  let page = 1;
  return exchanges.map(({ widgetResponse }) => {
    const action = widgetResponse?.action;
    if (action === TABLE_NEXT) page += 1;
    else if (action === TABLE_PREVIOUS) page = Math.max(1, page - 1);
    else if (action !== TABLE_DOWNLOAD_ALL) page = 1;
    return page;
  });
}
