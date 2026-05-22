.PHONY: help list doctor bootstrap status

help:
	./scripts/workspace.sh help

list:
	./scripts/workspace.sh list

doctor:
	./scripts/workspace.sh doctor

bootstrap:
	./scripts/workspace.sh bootstrap

status:
	./scripts/workspace.sh status
