package sessions

import (
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/util"
)

// Service contains session operations that are independent of a transport.
type Service struct {
	Store session.Store
}

func (s Service) List() ([]session.SessionMeta, error) {
	metas, err := s.Store.List()
	if err != nil {
		return nil, err
	}
	for i := range metas {
		if strings.TrimSpace(metas[i].Title) != "" && metas[i].Title != "(empty)" {
			metas[i].Title = util.Truncate(strings.TrimSpace(metas[i].Title), 40)
			continue
		}
		record, loadErr := s.Store.Load(metas[i].ID)
		if loadErr == nil {
			metas[i].Title = Title(record.Messages, record.Title)
		} else {
			metas[i].Title = "New Chat"
		}
	}
	return metas, nil
}

func (s Service) Data(id string) ([]llm.Message, error) {
	record, err := s.Store.Load(id)
	if err != nil {
		return nil, err
	}
	messages := make([]llm.Message, 0, len(record.Messages))
	for _, message := range record.Messages {
		if message.Role != "system" {
			messages = append(messages, message)
		}
	}
	return messages, nil
}

func (s Service) Create(id, title string) error {
	return s.Store.Save(session.Record{
		ID:        id,
		Title:     title,
		CreatedAt: time.Now().UTC(),
		Messages:  []llm.Message{},
	})
}

func (s Service) Delete(id string) error {
	return s.Store.Delete(id)
}

func (s Service) Rename(id, title string) error {
	record, err := s.Store.Load(id)
	if err != nil {
		return err
	}
	record.Title = title
	return s.Store.Save(record)
}

func Title(messages []llm.Message, customTitle string) string {
	title := strings.TrimSpace(customTitle)
	if title == "" || title == "(empty)" {
		for _, message := range messages {
			if message.Role == "user" && strings.TrimSpace(message.Content) != "" {
				title = strings.TrimSpace(message.Content)
				break
			}
		}
	}
	if title == "" || title == "(empty)" {
		title = "New Chat"
	}
	return util.Truncate(title, 40)
}
