VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -X main.version=$(VERSION) -s -w
BIN := excelsior
PKG := ./...

.PHONY: build vet lint test race vuln run tidy clean docker

build:
	go build -ldflags "$(LDFLAGS)" -o $(BIN).exe ./cmd/excelsior

build-all:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-linux-amd64 ./cmd/excelsior
	GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-darwin-arm64 ./cmd/excelsior
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-windows-amd64.exe ./cmd/excelsior

vet:
	go vet $(PKG)

lint:
	golangci-lint run --timeout 3m

test:
	go test $(PKG) -count=1

race:
	go test -race -count=1 $(PKG)

vuln:
	govulncheck ./...

tidy:
	go mod tidy

run:
	go run -ldflags "$(LDFLAGS)" ./cmd/excelsior

docker:
	docker build -t excelsior:$(VERSION) .

clean:
	rm -f $(BIN).exe
	rm -rf dist
