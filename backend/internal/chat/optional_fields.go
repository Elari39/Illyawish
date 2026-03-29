package chat

import (
	"bytes"
	"encoding/json"
)

type optionalNullableUint struct {
	set   bool
	value *uint
}

func (field *optionalNullableUint) UnmarshalJSON(data []byte) error {
	field.set = true

	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		field.value = nil
		return nil
	}

	var value uint
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}

	field.value = &value
	return nil
}

func (field optionalNullableUint) IsSet() bool {
	return field.set
}

func (field optionalNullableUint) Value() *uint {
	return cloneUint(field.value)
}

func nullableUintValue(value uint) optionalNullableUint {
	return optionalNullableUint{
		set:   true,
		value: &value,
	}
}

func nullableUintNull() optionalNullableUint {
	return optionalNullableUint{set: true}
}
