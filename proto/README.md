# buf.build/talaagent/domain

Field options and types for
[protoc-gen-domain](https://github.com/talaagent/proto-domain), which generates
TypeScript domain types and codecs over protobuf-es.

- `talaagent/domain/v1/options.proto`: `(talaagent.domain.v1.field)` with
  `brand` (a nominal type for a scalar), `date` (which form of
  `google.type.Date` a field holds) and `required`.
- `talaagent/domain/v1/calendar_duration.proto`: `CalendarDuration`, a duration
  with calendar units, mapped to `Temporal.Duration`.

```yaml
# buf.yaml
deps:
  - buf.build/talaagent/domain
```

```proto
import "talaagent/domain/v1/options.proto";

message Account {
  string id = 1 [(talaagent.domain.v1.field).brand = "AccountId"];
}
```
