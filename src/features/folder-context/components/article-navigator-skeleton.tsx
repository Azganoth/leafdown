import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalization } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

const SKELETON_ROWS = [
  { depth: 0, width: "62%" },
  { depth: 1, width: "78%" },
  { depth: 1, width: "56%" },
  { depth: 0, width: "70%" },
  { depth: 1, width: "66%" },
] as const;

interface ArticleNavigatorSkeletonProps {
  folderPath: string;
}

export function ArticleNavigatorSkeleton({ folderPath }: ArticleNavigatorSkeletonProps) {
  const { t } = useLocalization();
  const folderName = getPathParts(folderPath).name;

  return (
    <Card aria-busy="true" size="sm" className="min-h-0 min-w-0 flex-1">
      <CardHeader className="shrink-0">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={folderPath}>
            {folderName || folderPath}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1">
        <span role="status" className="sr-only">
          {t("articleNavigator.loading")}
        </span>
        {SKELETON_ROWS.map((row, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="flex h-[30px] items-center"
            style={{ paddingLeft: `${row.depth * 14 + 6}px` }}
          >
            <Skeleton className="h-3.5" style={{ width: row.width }} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
