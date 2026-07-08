import type { ArticleTree, FolderContextState } from "@/features/folder-context";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
  TEST_NOTES_FOLDER_PATH,
} from "@/test/fixtures/paths";

const getPathName = (path: string) => path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;

export const createArticleTree = (overrides: Partial<ArticleTree> = {}): ArticleTree => ({
  name: "Notes",
  path: TEST_NOTES_FOLDER_PATH,
  children: [{ kind: "file", name: "readme.md", path: TEST_MARKDOWN_FILE_PATH }],
  ...overrides,
});

export const createFolderContext = (
  overrides: Partial<FolderContextState> = {},
): FolderContextState => ({
  path: TEST_NOTES_FOLDER_PATH,
  tree: createArticleTree(),
  isEmpty: false,
  warnings: [],
  ...overrides,
});

export const createEmptyFolderContext = (
  overrides: Partial<FolderContextState> = {},
): FolderContextState => {
  const { path = TEST_NOTES_FOLDER_PATH, tree, ...contextOverrides } = overrides;

  return createFolderContext({
    path,
    tree: tree ?? createArticleTree({ name: getPathName(path), path, children: [] }),
    isEmpty: true,
    ...contextOverrides,
  });
};

export const createFolderContextWithNestedReadme = (
  overrides: Partial<FolderContextState> = {},
): FolderContextState =>
  createFolderContext({
    tree: createArticleTree({
      children: [
        {
          kind: "directory",
          name: "docs",
          path: TEST_NESTED_DIRECTORY_PATH,
          children: [
            {
              kind: "file",
              name: "readme.md",
              path: TEST_NESTED_MARKDOWN_FILE_PATH,
            },
          ],
        },
      ],
    }),
    ...overrides,
  });

export const createNestedArticleTree = (overrides: Partial<ArticleTree> = {}): ArticleTree =>
  createArticleTree({
    children: [
      { kind: "file", name: "readme.md", path: TEST_MARKDOWN_FILE_PATH },
      {
        kind: "file",
        name: "draft.markdown",
        path: `${TEST_NOTES_FOLDER_PATH}/draft.markdown`,
      },
      {
        kind: "directory",
        name: "docs",
        path: TEST_NESTED_DIRECTORY_PATH,
        children: [
          {
            kind: "file",
            name: "spec.md",
            path: `${TEST_NESTED_DIRECTORY_PATH}/spec.md`,
          },
        ],
      },
      {
        kind: "directory",
        name: "empty",
        path: `${TEST_NOTES_FOLDER_PATH}/empty`,
        children: [],
      },
    ],
    ...overrides,
  });
